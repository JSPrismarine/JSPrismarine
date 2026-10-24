import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

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

    public encodePayload(): void {
        this.writeVarInt(this.radius);
    }

    public decodePayload(): void {
        this.radius = this.readVarInt();
    }
}
