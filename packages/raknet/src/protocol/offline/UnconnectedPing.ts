import { MessageIdentifiers } from '../MessageIdentifiers';
import OfflinePacket from '../OfflinePacket';

export default class UnconnectedPing extends OfflinePacket {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.UNCONNECTED_PING, buffer);
    }

    public timestamp!: bigint;
    // public clientGUID!: bigint;

    public decodePayload() {
        this.timestamp = this.readLong();
        this.readMagic();
        // this.clientGUID = this.readLong();
    }

    public encodePayload() {
        this.writeLong(this.timestamp);
        this.writeMagic();
        // this.writeLong(this.clientGUID);
    }
}
