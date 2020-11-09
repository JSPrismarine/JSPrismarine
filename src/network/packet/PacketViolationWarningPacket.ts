import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class PacketViolationWarningPacket extends DataPacket {
    static NetID = Identifiers.PacketViolationWarningPacket;

    public type: number = 0;
    public severity: number = 0;
    public packetId: number = 0;
    public message: string = '';

    public decodePayload() {
        this.type = this.readVarInt();
        this.severity = this.readVarInt();
        this.packetId = this.readVarInt();
        this.message = this.readString();
    }
}
