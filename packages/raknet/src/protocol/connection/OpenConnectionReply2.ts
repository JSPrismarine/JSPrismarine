import type { InetAddress } from '../../RakNet';
import { MessageIdentifiers } from '../MessageIdentifiers';
import OfflinePacket from '../OfflinePacket';

export default class OpenConnectionReply2 extends OfflinePacket {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.OPEN_CONNECTION_REPLY_2, buffer);
    }

    public serverGuid!: bigint;
    public clientAddress!: InetAddress;
    public mtuSize!: number;

    public decodePayload(): void {
        this.readMagic();
        this.serverGuid = this.readLong();
        this.clientAddress = this.readAddress();
        this.mtuSize = this.readUnsignedShort();
        this.readByte(); // Require security of client
    }

    public encodePayload(): void {
        this.writeMagic();
        this.writeLong(this.serverGuid);
        this.writeAddress(this.clientAddress);
        this.writeUnsignedShort(this.mtuSize);
        this.writeByte(0); // Require security of client
    }
}
