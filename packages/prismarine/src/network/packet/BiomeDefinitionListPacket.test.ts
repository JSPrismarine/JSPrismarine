import { biome_definitions_network } from '@jsprismarine/bedrock-data';
import { netIdFor } from '@jsprismarine/protocol/wire/versions/v2193';
import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import BiomeDefinitionListPacket from './BiomeDefinitionListPacket';

/**
 * Reads one `BiomeDefinitionData` the way the 2193 client does and returns the fields a test
 * can check. `tags` and `chunk gen data` sit behind a presence bool on the wire; vanilla sends
 * no chunk generation data, so a present one is reported rather than parsed.
 */
const readBiomeDefinition = (stream: BinaryStream) => {
    const id = stream.readUnsignedShortLE();
    const temperature = stream.readFloatLE();
    const downfall = stream.readFloatLE();
    const foliageSnow = stream.readFloatLE();
    const depth = stream.readFloatLE();
    const scale = stream.readFloatLE();
    const mapWaterColor = stream.readIntLE();
    const rain = stream.readBoolean();

    const tags: number[] = [];
    if (stream.readBoolean()) {
        const count = stream.readUnsignedVarInt();
        for (let i = 0; i < count; i++) tags.push(stream.readUnsignedShortLE());
    }

    const hasChunkGenData = stream.readBoolean();

    return { id, temperature, downfall, foliageSnow, depth, scale, mapWaterColor, rain, tags, hasChunkGenData };
};

describe('network', () => {
    describe('packet', () => {
        describe('BiomeDefinitionListPacket', () => {
            it('writes the packet id as a varuint followed by the payload bytes', () => {
                const pk = new BiomeDefinitionListPacket();
                pk.encode();

                const buffer = pk.getBuffer();

                // 122 = 0x7a, which fits in one LEB128 byte.
                expect([...buffer.subarray(0, 1)]).toEqual([0x7a]);
                expect(buffer.subarray(1).equals(biome_definitions_network)).toBe(true);
            });

            it('starts with a biome count the client can use, not an NBT tag', () => {
                // At 2193 the payload is a varuint32 count of biome definitions followed by the
                // shared string table, which replaced the single NBT compound of protocol 748. A
                // compound would start with 0x0a, and a client reading that as a count would
                // expect ten definitions and then run off the end.
                const stream = new BinaryStream(biome_definitions_network);

                expect(stream.readUnsignedVarInt()).toBe(89);
            });

            it('ships the biome map and the string list it indexes, and nothing after them', () => {
                const stream = new BinaryStream(biome_definitions_network);

                const biomeCount = stream.readUnsignedVarInt();
                const entries: { key: number; definition: ReturnType<typeof readBiomeDefinition> }[] = [];
                for (let i = 0; i < biomeCount; i++) {
                    const key = stream.readUnsignedShortLE();
                    entries.push({ key, definition: readBiomeDefinition(stream) });
                }

                const stringCount = stream.readUnsignedVarInt();
                const strings: string[] = [];
                for (let i = 0; i < stringCount; i++) strings.push(NetworkUtil.readString(stream));

                // Both fields parsed, and the payload ends exactly where the string list does.
                expect(stream.feof()).toBe(true);
                expect(entries).toHaveLength(89);
                expect(strings).toHaveLength(187);

                // Every map key and every tag is an index into the string list, and the keys
                // name biomes.
                for (const { key, definition } of entries) {
                    expect(key).toBeLessThan(stringCount);
                    expect(strings[key]).toMatch(/^minecraft:/);
                    for (const tag of definition.tags) expect(tag).toBeLessThan(stringCount);
                    // Vanilla leaves client-side chunk generation off, so no biome carries it.
                    expect(definition.hasChunkGenData).toBe(false);
                }

                // Spot-check the first entry against the bytes a BDS 1.26.51.1 sent.
                expect(entries[0]).toMatchObject({
                    key: strings.indexOf('minecraft:ocean'),
                    definition: {
                        id: 0xffff,
                        temperature: expect.closeTo(0.5),
                        downfall: expect.closeTo(0.5),
                        foliageSnow: 0,
                        depth: expect.closeTo(-1),
                        scale: expect.closeTo(0.1),
                        rain: true,
                        hasChunkGenData: false
                    }
                });
                expect(entries[0]?.definition.tags.map((tag) => strings[tag])).toEqual([
                    'monster',
                    'ocean',
                    'overworld',
                    'fast_fishing',
                    'high_seas'
                ]);
            });

            it('reads a hand-built buffer to its end', () => {
                const pk = new BiomeDefinitionListPacket();
                pk.setReadBuffer(Buffer.from([0x7a, 0x00, 0x00]));
                pk.decode();

                expect([...pk.definitions]).toEqual([0x00, 0x00]);
                expect(pk.feof()).toBe(true);
            });

            it('uses the network id the client expects', () => {
                expect(netIdFor('BiomeDefinitionListPacket')).toBe(Identifiers.BiomeDefinitionListPacket);
                expect(netIdFor('BiomeDefinitionListPacket')).toBe(0x7a);
            });
        });
    });
});
