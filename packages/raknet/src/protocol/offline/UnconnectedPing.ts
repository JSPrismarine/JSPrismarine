import { MessageIdentifiers } from '../MessageIdentifiers';
import OfflinePacket from '../OfflinePacket';

export default class UnconnectedPing extends OfflinePacket {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.UNCONNECTED_PING, buffer);
    }

    public timestamp!: bigint;
    // public clientGUID!: bigint;

    public decodePayload(): void {
        this.timestamp = this.readUnsignedLong();
        this.readMagic();
        // this.clientGUID = this.readUnsignedLong();
    }

    public encodePayload(): void {
        this.writeUnsignedLong(this.timestamp);
        this.writeMagic();
        // this.writeUnsignedLong(this.clientGUID);
    }
}
