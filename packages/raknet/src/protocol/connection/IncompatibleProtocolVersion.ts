import MessageHeaders from '../MessageHeaders';
import OfflinePacket from '../UnconnectedPacket';

export default class IncompatibleProtocolVersion extends OfflinePacket {
    public constructor() {
        super(MessageHeaders.INCOMPATIBLE_PROTOCOL_VERSION);
    }

    public protocol!: number;
    public serverGUID!: bigint;

    public encodePayload(): void {
        this.writeByte(this.protocol);
        this.writeMagic();
        this.writeLong(this.serverGUID);
    }
}
