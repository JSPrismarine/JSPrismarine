import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

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
        NetworkUtil.writeString(this, this.message);
    }

    public decodePayload() {
        this.type = this.readVarInt();
        this.severity = this.readVarInt();
        this.packetId = this.readVarInt();
        this.message = NetworkUtil.readString(this);
    }
}
