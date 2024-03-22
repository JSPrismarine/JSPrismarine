import { MessageIdentifiers } from '../MessageIdentifiers';
import OfflinePacket from '../OfflinePacket';

export default class UnconnectedPong extends OfflinePacket {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.UNCONNECTED_PONG, buffer);
    }

    public timestamp!: bigint;
    public serverGuid!: bigint;
    public serverName!: string;

    public decodePayload(): void {
        this.timestamp = this.readLong();
        this.serverGuid = this.readLong();
        this.readMagic();
        this.serverName = this.readString();
    }

    public encodePayload(): void {
        this.writeLong(this.timestamp);
        this.writeLong(this.serverGuid);
        this.writeMagic();
        this.writeString(this.serverName);
    }
}
