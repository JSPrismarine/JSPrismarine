import Identifiers from './Identifiers';
import OfflinePacket from './OfflinePacket';

export default class IncompatibleProtocolVersion extends OfflinePacket {
    public constructor() {
        super(Identifiers.IncompatibleProtocolVersion);
    }

    public protocol!: number;
    public serverGUID!: bigint;

    public encodePayload(): void {
        this.writeByte(this.protocol);
        this.writeMagic();
        this.writeLong(this.serverGUID);
    }
}
