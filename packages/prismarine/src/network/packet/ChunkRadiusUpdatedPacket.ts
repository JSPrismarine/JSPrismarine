import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

/**
 * Packet for handling changing the client's view distance.
 *
 * **Bound To:** Client
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Radius | VarInt | The view-distance |
 */
export default class ChunkRadiusUpdatedPacket extends DataPacket {
    public static NetID = Identifiers.ChunkRadiusUpdatedPacket;

    /**
     * The view distance as a radius
     */
    public radius!: number;

    public encodePayload() {
        this.writeVarInt(this.radius);
    }

    public decodePayload() {
        this.radius = this.readVarInt();
    }
}
