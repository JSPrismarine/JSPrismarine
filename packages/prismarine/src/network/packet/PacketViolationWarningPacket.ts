import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import McpeUtil from '../NetworkUtil';

export default class PacketViolationWarningPacket extends DataPacket {
    public static NetID = Identifiers.PacketViolationWarningPacket;

    public type!: number;
    public severity!: number;
    public packetId!: number;
    public message!: string;

    public encodePayload() {
        this.writeVarInt(this.type);
        this.writeVarInt(this.severity);
        this.writeVarInt(this.packetId);
        McpeUtil.writeString(this, this.message);
    }

    public decodePayload() {
        this.type = this.readVarInt();
        this.severity = this.readVarInt();
        this.packetId = this.readVarInt();
        this.message = McpeUtil.readString(this);
    }
}
