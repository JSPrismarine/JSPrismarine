import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class RequestChunkRadiusPacket extends DataPacket {
    public static NetID = Identifiers.RequestChunkRadiusPacket;

    public radius!: number;
    public maxRadius!: number;

    public encodePayload(): void {
        this.writeVarInt(this.radius);
        this.writeByte(this.maxRadius);
    }

    public decodePayload(): void {
        this.radius = this.readVarInt();
        this.maxRadius = this.readByte();
    }
}
