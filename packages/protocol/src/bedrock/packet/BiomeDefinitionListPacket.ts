import { biomeDefinitionListPacket } from '../wire/definitions/biomeDefinitionList';
import { layoutAt } from '../../wire/WireLayout';
import FieldNetworkPacket from '../../FieldNetworkPacket';

import type { ProtocolContext } from '../ProtocolContext';
import { ProtocolCodecErrors } from '@jsprismarine/errors/protocol/codec';
import BinaryStream from '@jsprismarine/binaryutils';

/**
 * A biome the server adds to the captured vanilla list, such as one a behavior pack defines: a
 * `BiomeDefinitionData` with its name and tags as strings rather than string-list indices.
 */
export interface BiomeDefinitionEntry {
    readonly name: string;
    /** The numeric id chunks carry for the biome. BDS gives pack biomes 30000 and up. */
    readonly id: number;
    readonly temperature: number;
    readonly downfall: number;
    readonly foliageSnow: number;
    readonly depth: number;
    readonly scale: number;
    /** The map water color, ARGB, as a signed 32-bit integer. */
    readonly mapWaterColor: number;
    readonly rain: boolean;
    /** The tags, or undefined to send none. */
    readonly tags?: readonly string[];
}

/** One map entry as the wire holds it, with string-list indices. */
interface RawEntry {
    readonly key: number;
    readonly id: number;
    readonly floats: readonly [number, number, number, number, number];
    readonly mapWaterColor: number;
    readonly rain: boolean;
    readonly tags: readonly number[] | undefined;
}

/**
 * A biome definition payload, both fields, with `entries` added after the ones it holds. Each
 * new entry's tag strings that the string list lacks join it, then the entry's name, which is
 * the order protocol 2225's pinned BDS wrote them in for a behavior pack's biomes.
 *
 * @param payload - The payload to add to, as {@link BiomeDefinitionListPacket.definitions} holds it.
 * @throws {ProtocolCodecErrors.BiomeChunkGenerationDataUnsupported} When an entry of the payload
 *   carries chunk generation data, which this reader does not model.
 */
export const appendBiomeDefinitions = (payload: Buffer, entries: readonly BiomeDefinitionEntry[]): Buffer => {
    const reader = new BinaryStream(payload);
    const raw: RawEntry[] = [];
    const count = reader.readUnsignedVarInt();
    for (let index = 0; index < count; index++) {
        const key = reader.readUnsignedShortLE();
        const id = reader.readUnsignedShortLE();
        const floats = [
            reader.readFloatLE(),
            reader.readFloatLE(),
            reader.readFloatLE(),
            reader.readFloatLE(),
            reader.readFloatLE()
        ] as const;
        const mapWaterColor = reader.readIntLE();
        const rain = reader.readBoolean();
        let tags: number[] | undefined;
        if (reader.readBoolean()) {
            const tagCount = reader.readUnsignedVarInt();
            tags = Array.from({ length: tagCount }, () => reader.readUnsignedShortLE());
        }
        if (reader.readBoolean()) throw new ProtocolCodecErrors.BiomeChunkGenerationDataUnsupported({ index });
        raw.push({ key, id, floats, mapWaterColor, rain, tags });
    }
    const strings: string[] = [];
    const stringCount = reader.readUnsignedVarInt();
    for (let index = 0; index < stringCount; index++) {
        strings.push(reader.read(reader.readUnsignedVarInt()).toString('utf8'));
    }

    const indexOf = new Map(strings.map((each, index) => [each, index]));
    const intern = (value: string): number => {
        const known = indexOf.get(value);
        if (known !== undefined) return known;
        indexOf.set(value, strings.length);
        strings.push(value);
        return strings.length - 1;
    };
    for (const entry of entries) {
        const tags = entry.tags?.map(intern);
        raw.push({
            key: intern(entry.name),
            id: entry.id,
            floats: [entry.temperature, entry.downfall, entry.foliageSnow, entry.depth, entry.scale],
            mapWaterColor: entry.mapWaterColor,
            rain: entry.rain,
            tags
        });
    }

    const writer = new BinaryStream();
    writer.writeUnsignedVarInt(raw.length);
    for (const { key, id, floats, mapWaterColor, rain, tags } of raw) {
        writer.writeUnsignedShortLE(key);
        writer.writeUnsignedShortLE(id);
        for (const value of floats) writer.writeFloatLE(value);
        writer.writeIntLE(mapWaterColor);
        writer.writeBoolean(rain);
        writer.writeBoolean(tags !== undefined);
        if (tags !== undefined) {
            writer.writeUnsignedVarInt(tags.length);
            for (const tag of tags) writer.writeUnsignedShortLE(tag);
        }
        // No chunk generation data: the client generates nothing for a server's dimension.
        writer.writeBoolean(false);
    }
    writer.writeUnsignedVarInt(strings.length);
    for (const each of strings) {
        const bytes = Buffer.from(each, 'utf8');
        writer.writeUnsignedVarInt(bytes.length);
        writer.write(bytes);
    }
    return writer.getBuffer();
};

/**
 * Every biome the client can render, and the data each one carries.
 *
 * Protocol 2193 lays the payload out as two fields. `Map of Biome names to data` is a varuint32
 * count followed by that many entries, each a uint16 key that indexes the string list below and
 * a `BiomeDefinitionData`: `id` (uint16), `temperature`, `downfall`, `foliage snow`, `depth` and
 * `scale` (floats), `map water color ARGB` (int32), `rain` (bool), then `tags` and `chunk gen
 * data`, each behind a bool that says whether it is present. Present tags are a varuint32 count
 * of uint16 string indices. `String list` is a varuint32 count of strings every index refers
 * to. This replaced the loose lists 2168 had and the single NBT compound 748 had. A chunk's
 * biome section is indices into this list, and a client that reaches the world-generation
 * screen with an empty one cannot build the world and disconnects.
 *
 * The full payload is supplied for the negotiated connection through
 * `ProtocolContext.biomeDefinitions`, or explicitly through {@link definitions}. It is kept as
 * bytes here because captures may include version-specific tags and chunk generation data.
 *
 * The wire layout is the `biomeDefinitionListPacket` definition in the protocol package.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/biome-definition-list-packet/
 */
export default class BiomeDefinitionListPacket extends FieldNetworkPacket {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'BiomeDefinitionListPacket';
    }

    /** Both fields as the network carries them, or `null` to use the connection's captured bytes. */
    public definitions: Buffer | null = null;

    /** Writes the definitions, taking the bytes from the connection context when unset. */
    public encodePayload(context?: ProtocolContext): void {
        const definitions = this.definitions ?? context?.biomeDefinitions;
        if (definitions === undefined) {
            throw new ProtocolCodecErrors.MissingBiomeDefinitions();
        }

        layoutAt(biomeDefinitionListPacket, this.codecProtocol).encode(this, { definitions });
    }

    /** Reads the definitions, which run to the end of the packet. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(biomeDefinitionListPacket, this.codecProtocol).decode(this));
    }
}
