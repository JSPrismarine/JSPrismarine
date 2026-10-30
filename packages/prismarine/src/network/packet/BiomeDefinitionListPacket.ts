import { biome_definitions_network } from '@jsprismarine/bedrock-data';
import { biomeDefinitionListPacket, layoutAt } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

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
 * This server defines no custom biomes, so it replays vanilla's: the exact payload a Bedrock
 * Dedicated Server 1.26.51.1 sends, recorded by `packages/client/tools/capture-server-data.mjs`.
 * Vanilla sends 89 biomes, none with chunk generation data, over a 187-entry string list.
 * Modeling the map field by field would only create ways to disagree with the client about a
 * blob that is identical for every server of this version.
 *
 * The wire layout is the `biomeDefinitionListPacket` definition in the protocol package.
 *
 * **Bound To:** Client
 */
export default class BiomeDefinitionListPacket extends FieldNetworkPacket {
    /** Both fields as the network carries them. Defaults to vanilla's. */
    public definitions: Buffer = biome_definitions_network;

    /** Writes the definitions, which are the whole payload. */
    public encodePayload(): void {
        layoutAt(biomeDefinitionListPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads the definitions, which run to the end of the packet. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(biomeDefinitionListPacket, this.codecProtocol).decode(this));
    }
}
