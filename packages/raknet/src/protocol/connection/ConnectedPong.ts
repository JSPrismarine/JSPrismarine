import { MessageIdentifiers } from '../MessageIdentifiers';
import Packet from '../Packet';

/**
 * The answer to a `ConnectedPing`.
 *
 * Wire layout: id, the ping's `clientTimestamp`, then our `serverTimestamp`, both unsigned
 * 64 bit `RakNet::Time` values. RakNet only accepts it at exactly this length.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L6062
 */
export default class ConnectedPong extends Packet {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.CONNECTED_PONG, buffer);
    }

    public clientTimestamp!: bigint;
    public serverTimestamp!: bigint;

    public decodePayload(): void {
        this.clientTimestamp = this.readUnsignedLong();
        this.serverTimestamp = this.readUnsignedLong();
    }

    public encodePayload(): void {
        this.writeUnsignedLong(this.clientTimestamp);
        this.writeUnsignedLong(this.serverTimestamp);
    }
}
