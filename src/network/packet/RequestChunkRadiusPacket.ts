import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class RequestChunkRadiusPacket extends DataPacket {
    static NetID = Identifiers.RequestChunkRadiusPacket;

    public radius!: number;

    public encodePayload() {
        this.writeVarInt(this.radius);
    }

    public decodePayload() {
        this.radius = this.readVarInt();
    }
}
