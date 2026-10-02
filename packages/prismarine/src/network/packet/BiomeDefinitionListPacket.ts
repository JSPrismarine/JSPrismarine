import { biome_definitions_network } from '@jsprismarine/bedrock-data';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * Every biome the client can render, and the data each one carries.
 *
 * At 2193 this is a map of biome name to data plus a shared string table the entries index
 * into - not the two loose lists 2168 had, and not the single NBT compound 748 had. The client
 * needs it to finish world generation: a chunk's biome section is indices into this list, and
 * a client that reaches the world-generation screen with an empty one cannot build the world
 * and disconnects.
 *
 * This server defines no custom biomes, so it replays vanilla's - the exact payload a Bedrock
 * Dedicated Server 1.26.51.1 sends, recorded by `packages/client/tools/capture-server-data.mjs`.
 * Modelling the map field by field would only create ways to disagree with the client about a
 * blob that is identical for every server of this version.
 *
 * **Bound To:** Client
 */
export default class BiomeDefinitionListPacket extends DataPacket {
    public static NetID = Identifiers.BiomeDefinitionListPacket;

    /** The definitions as the network carries them. Defaults to vanilla's. */
    public definitions: Buffer = biome_definitions_network;

    public encodePayload(): void {
        this.write(this.definitions);
    }

    public decodePayload(): void {
        this.definitions = this.readRemaining();
    }
}
