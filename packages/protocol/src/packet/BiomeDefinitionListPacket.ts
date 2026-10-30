import { biomeDefinitionListPacket } from '../wire/definitions/biomeDefinitionList';
import { layoutAt } from '../wire/WireLayout';
import FieldNetworkPacket from '../FieldNetworkPacket';

import type { ProtocolContext } from '../ProtocolContext';

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
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/biome-definition-list-packet/
 */
export default class BiomeDefinitionListPacket extends FieldNetworkPacket {
    /** Both fields as the network carries them, or `null` to use the connection's captured bytes. */
    public definitions: Buffer | null = null;

    /** Writes the definitions, taking the bytes from the connection context when unset. */
    public encodePayload(context?: ProtocolContext): void {
        const definitions = this.definitions ?? context?.biomeDefinitions;
        if (definitions === undefined) {
            throw new Error(
                'BiomeDefinitionListPacket requires biome definition data in the packet or protocol context'
            );
        }

        layoutAt(biomeDefinitionListPacket, this.codecProtocol).encode(this, { definitions });
    }

    /** Reads the definitions, which run to the end of the packet. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(biomeDefinitionListPacket, this.codecProtocol).decode(this));
    }
}
