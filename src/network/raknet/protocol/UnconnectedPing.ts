import Identifiers from './Identifiers';
import OfflinePacket from './OfflinePacket';

export default class UnconnectedPing extends OfflinePacket {
    public constructor(buffer?: Buffer) {
        super(Identifiers.UnconnectedPing, buffer);
    }

    public sendTimestamp!: bigint;
    public clientGUID!: bigint;

    public decodePayload() {
        this.sendTimestamp = this.readLong();
        this.readMagic();
        this.clientGUID = this.readLong();
    }

    public encodePayload() {
        this.writeLong(this.sendTimestamp);
        this.writeMagic();
        this.writeLong(this.clientGUID);
    }
}
