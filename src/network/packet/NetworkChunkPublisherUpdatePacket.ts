import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class NetworkChunkPublisherUpdatePacket extends DataPacket {
    static NetID = Identifiers.NetworkChunkPublisherUpdatePacket;

    public x: number = 0;
    public y: number = 0;
    public z: number = 0;
    public radius: number = 0;

    public encodePayload() {
        this.writeVarInt(this.x);
        this.writeVarInt(this.y);
        this.writeVarInt(this.z);
        this.writeUnsignedVarInt(this.radius);
    }
}
