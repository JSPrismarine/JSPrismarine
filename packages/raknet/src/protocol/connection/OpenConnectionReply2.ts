import type { InetAddress } from '../../';
import { MessageIdentifiers } from '../MessageIdentifiers';
import OfflinePacket from '../OfflinePacket';

/**
 * The answer to `OpenConnectionRequest2`, after which the connection exists.
 *
 * Wire layout: id, the offline magic, `serverGuid` (uint64), the `clientAddress` as a
 * `SystemAddress`, `mtuSize` as an unsigned big-endian short, then a byte saying whether
 * the client must use security, always 0 for Bedrock.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L5300
 */
export default class OpenConnectionReply2 extends OfflinePacket {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.OPEN_CONNECTION_REPLY_2, buffer);
    }

    public serverGuid!: bigint;
    public clientAddress!: InetAddress;
    public mtuSize!: number;

    public decodePayload(): void {
        this.readMagic();
        this.serverGuid = this.readUnsignedLong();
        this.clientAddress = this.readAddress();
        this.mtuSize = this.readUnsignedShort();
        this.readByte(); // Require security of client
    }

    public encodePayload(): void {
        this.writeMagic();
        this.writeUnsignedLong(this.serverGuid);
        this.writeAddress(this.clientAddress);
        this.writeUnsignedShort(this.mtuSize);
        this.writeByte(0); // Require security of client
    }
}
