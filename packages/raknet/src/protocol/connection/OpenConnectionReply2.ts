import { InetAddress } from '../../RakNet';
import MessageHeaders from '../MessageHeaders';
import OfflinePacket from '../UnconnectedPacket';

export default class OpenConnectionReply2 extends OfflinePacket {
    public constructor(buffer?: Buffer) {
        super(MessageHeaders.OPEN_CONNECTION_REPLY_2, buffer);
    }

    public serverGuid!: bigint;
    public clientAddress!: InetAddress;
    public mtuSize!: number;

    public decodePayload(): void {
        this.readMagic();
        this.serverGuid = this.readLong();
        this.clientAddress = this.readAddress();
        this.mtuSize = this.readShort();
        this.readByte(); // Secure
    }

    public encodePayload(): void {
        this.writeMagic();
        this.writeLong(this.serverGuid);
        this.writeAddress(this.clientAddress);
        this.writeShort(this.mtuSize);
        this.writeByte(0); // Secure
    }
}
