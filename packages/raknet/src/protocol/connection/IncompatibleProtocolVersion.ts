import { MessageIdentifiers } from '../MessageIdentifiers';
import OfflinePacket from '../OfflinePacket';

/**
 * Refuses an `OpenConnectionRequest1` whose RakNet protocol version is not ours.
 *
 * Wire layout: id, our `protocol` (uint8), the offline magic, then `serverGUID` (uint64).
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L5141
 */
export default class IncompatibleProtocolVersion extends OfflinePacket {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.INCOMPATIBLE_PROTOCOL_VERSION, buffer);
    }

    public protocol!: number;
    public serverGUID!: bigint;

    public decodePayload(): void {
        this.protocol = this.readByte();
        this.readMagic();
        this.serverGUID = this.readUnsignedLong();
    }

    public encodePayload(): void {
        this.writeByte(this.protocol);
        this.writeMagic();
        this.writeUnsignedLong(this.serverGUID);
    }
}
