import BinaryStream from "@jsprismarine/jsbinaryutils";
import InetAddress from "../util/InetAddress";
import { RakNetIdentifiers } from "./RakNetIdentifiers";
import OfflinePacket from "./types/OfflinePacket";

export default class OpenConnectionReplyTwo extends OfflinePacket {
    protected id: number = RakNetIdentifiers.OPEN_CONNECTION_REPLY_2;

    public serverGUID: bigint;
    public clientAddress: InetAddress;
    public mtuSize: number;

    protected encode(buffer: BinaryStream): void {
        this.encodeMagic();
        buffer.writeLong(this.serverGUID);
        this.encodeAddress(this.clientAddress);
        buffer.writeShort(this.mtuSize);
        buffer.writeByte(0);  // Encryption (not needed)
    }
}