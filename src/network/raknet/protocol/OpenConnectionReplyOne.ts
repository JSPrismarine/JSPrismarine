import BinaryStream from "@jsprismarine/jsbinaryutils";
import { RakNetIdentifiers } from "./RakNetIdentifiers";
import OfflinePacket from "./types/OfflinePacket";

export default class OpenConnectionReplyOne extends OfflinePacket {
    protected id: number = RakNetIdentifiers.OPEN_CONNECTION_REPLY_1;

    public GUID: bigint;
    public maximumTransferUnit: number;

    protected encode(buffer: BinaryStream): void {
        this.encodeMagic();
        buffer.writeLong(this.GUID);
        buffer.writeByte(0);  // useSecurity (not needed)
        buffer.writeShort(this.maximumTransferUnit);
    }
}