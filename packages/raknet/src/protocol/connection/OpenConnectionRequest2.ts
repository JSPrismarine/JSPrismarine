import type { InetAddress } from '../../';
import { MessageIdentifiers } from '../MessageIdentifiers';
import OfflinePacket from '../OfflinePacket';

/**
 * The second offline request, carrying the MTU the client settled on.
 *
 * Wire layout: id, the offline magic, the `serverAddress` the client dialed as a
 * `SystemAddress`, `mtuSize` as an unsigned big-endian short, then `clientGUID` (uint64).
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L4758
 */
export default class OpenConnectionRequest2 extends OfflinePacket {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.OPEN_CONNECTION_REQUEST_2, buffer);
    }

    public serverAddress!: InetAddress;
    public mtuSize!: number;
    public clientGUID!: bigint;

    public decodePayload(): void {
        this.readMagic();
        this.serverAddress = this.readAddress();
        this.mtuSize = this.readUnsignedShort();
        this.clientGUID = this.readUnsignedLong();
    }

    public encodePayload(): void {
        this.writeMagic();
        this.writeAddress(this.serverAddress);
        this.writeUnsignedShort(this.mtuSize);
        this.writeUnsignedLong(this.clientGUID);
    }
}
