import Identifiers from './Identifiers';
import OfflinePacket from './OfflinePacket';

export default class UnconnectedPong extends OfflinePacket {
    public constructor(buffer?: Buffer) {
        super(Identifiers.UnconnectedPong, buffer);
    }

    public sendTimestamp!: bigint;
    public serverGUID!: bigint;
    public serverName!: string;

    public decodePayload(): void {
        this.sendTimestamp = this.readLong();
        this.serverGUID = this.readLong();
        this.readMagic();
        this.serverName = this.readString();
    }

    public encodePayload(): void {
        this.writeLong(this.sendTimestamp);
        this.writeLong(this.serverGUID);
        this.writeMagic();
        this.writeString(this.serverName);
    }
}
