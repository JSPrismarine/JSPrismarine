import { MessageIdentifiers } from '../MessageIdentifiers';
import OfflinePacket from '../OfflinePacket';

/**
 * The answer to `OpenConnectionRequest1`, agreeing an MTU.
 *
 * Wire layout: id, the offline magic, `serverGUID` (uint64), a security byte that is always
 * 0 because Bedrock never enables RakNet's libcat security, then `mtuSize` as an unsigned
 * big-endian short.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L5164
 */
export default class OpenConnectionReply1 extends OfflinePacket {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.OPEN_CONNECTION_REPLY_1, buffer);
    }

    public serverGUID!: bigint;
    public mtuSize!: number;

    public decodePayload(): void {
        this.readMagic();
        this.serverGUID = this.readUnsignedLong();
        this.readByte(); // Secure
        this.mtuSize = this.readUnsignedShort();
    }

    public encodePayload(): void {
        this.writeMagic();
        this.writeUnsignedLong(this.serverGUID);
        this.writeByte(0); // Is using security
        this.writeUnsignedShort(this.mtuSize);
    }
}
