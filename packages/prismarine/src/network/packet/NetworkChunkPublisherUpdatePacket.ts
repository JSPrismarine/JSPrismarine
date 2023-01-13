import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';

export default class NetworkChunkPublisherUpdatePacket extends DataPacket {
    public static NetID = Identifiers.NetworkChunkPublisherUpdatePacket;

    public x!: number;
    public y!: number;
    public z!: number;
    public radius!: number;

    public encodePayload() {
        this.writeVarInt(this.x);
        this.writeVarInt(this.y);
        this.writeVarInt(this.z);
        this.writeUnsignedVarInt(this.radius);
        this.writeIntLE(0); // saved chunks
    }
}
