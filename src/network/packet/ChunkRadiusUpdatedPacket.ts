import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ChunkRadiusUpdatedPacket extends DataPacket {
    static NetID = Identifiers.ChunkRadiusUpdatedPacket;

    public radius: number = 0;

    public encodePayload() {
        this.writeVarInt(this.radius);
    }
    public decodePayload() {
        this.radius = this.readVarInt();
    }
}
