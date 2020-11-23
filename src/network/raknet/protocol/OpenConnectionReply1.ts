import Identifiers from './Identifiers';
import OfflinePacket from './OfflinePacket';

export default class OpenConnectionReply1 extends OfflinePacket {
    public constructor(buffer?: Buffer) {
        super(Identifiers.OpenConnectionReply1, buffer);
    }

    public serverGUID!: bigint;
    public mtuSize!: number;

    public decodePayload(): void {
        this.readMagic();
        this.serverGUID = this.readLong();
        this.readByte(); // secure
        this.mtuSize = this.readShort();
    }

    public encodePayload(): void {
        this.writeMagic();
        this.writeLong(this.serverGUID);
        this.writeByte(0); // secure
        this.writeShort(this.mtuSize);
    }
}
