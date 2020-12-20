import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class PacketViolationWarningPacket extends DataPacket {
    static NetID = Identifiers.PacketViolationWarningPacket;

    public type!: number;
    public severity!: number;
    public packetId!: number;
    public message!: string;

    public encodePayload() {
        this.writeVarInt(this.type);
        this.writeVarInt(this.severity);
        this.writeVarInt(this.packetId);
        this.writeString(this.message);
    }

    public decodePayload() {
        this.type = this.readVarInt();
        this.severity = this.readVarInt();
        this.packetId = this.readVarInt();
        this.message = this.readString();
    }
}
