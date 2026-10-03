import { jigsaw_structure_data } from '@jsprismarine/bedrock-data';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * The jigsaw structure rules: how villages, bastions, trail ruins and the rest are assembled
 * from their pieces.
 *
 * One network NBT compound and nothing else. The client wants a copy because it generates
 * chunks itself when the server lets it, and from protocol 2193 (Minecraft 1.26.50) it wants
 * it *before* `StartGamePacket`: a client that reaches StartGame without having been sent
 * this disconnects with `MissingStructureData`, whether or not it was ever going to generate
 * anything.
 *
 * This server has no jigsaw rules of its own, so it sends vanilla's - the payload a Bedrock
 * Dedicated Server 1.26.51.1 sent, recorded by `packages/client/tools/capture-server-data.mjs`
 * and handed on verbatim. Two hundred kilobytes, once per join, and mostly repeated names that
 * compress well.
 *
 * **Bound To:** Client
 */
export default class JigsawStructureDataPacket extends DataPacket {
    public static NetID = Identifiers.JigsawStructureDataPacket;

    /** The rules as network NBT. Defaults to vanilla's. */
    public structureData: Buffer = jigsaw_structure_data;

    public encodePayload(): void {
        this.write(this.structureData);
    }

    public decodePayload(): void {
        this.structureData = this.readRemaining();
    }
}
