import { MessageIdentifiers } from '../MessageIdentifiers';
import OfflinePacket from '../OfflinePacket';

export default class IncompatibleProtocolVersion extends OfflinePacket {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.INCOMPATIBLE_PROTOCOL_VERSION, buffer);
    }

    public protocol!: number;
    public serverGUID!: bigint;

    public decodePayload(): void {
        this.protocol = this.readByte();
        this.readMagic();
        this.serverGUID = this.readLong();
    }

    public encodePayload(): void {
        this.writeByte(this.protocol);
        this.writeMagic();
        this.writeLong(this.serverGUID);
    }
}
