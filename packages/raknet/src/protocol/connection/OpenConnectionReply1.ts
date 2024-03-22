import { MessageIdentifiers } from '../MessageIdentifiers';
import OfflinePacket from '../OfflinePacket';

export default class OpenConnectionReply1 extends OfflinePacket {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.OPEN_CONNECTION_REPLY_1, buffer);
    }

    public serverGUID!: bigint;
    public mtuSize!: number;

    public decodePayload(): void {
        this.readMagic();
        this.serverGUID = this.readLong();
        this.readByte(); // Secure
        this.mtuSize = this.readUnsignedShort();
    }

    public encodePayload(): void {
        this.writeMagic();
        this.writeLong(this.serverGUID);
        this.writeByte(0); // Is using security
        this.writeUnsignedShort(this.mtuSize);
    }
}
