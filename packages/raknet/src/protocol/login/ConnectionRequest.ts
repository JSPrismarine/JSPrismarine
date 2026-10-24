import { MessageIdentifiers } from '../MessageIdentifiers';
import Packet from '../Packet';

/**
 * The first message inside the connection, opening the connected handshake.
 *
 * Wire layout: id, `clientGUID` (uint64), `requestTimestamp` as an unsigned 64 bit
 * `RakNet::Time`, then a security byte that is always 0 for Bedrock.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L5006
 */
export default class ConnectionRequest extends Packet {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.CONNECTION_REQUEST, buffer);
    }

    public clientGUID!: bigint;
    public requestTimestamp!: bigint;

    public decodePayload(): void {
        this.clientGUID = this.readUnsignedLong();
        this.requestTimestamp = this.readUnsignedLong();
        this.readByte(); // Secure
    }

    public encodePayload(): void {
        this.writeUnsignedLong(this.clientGUID);
        this.writeUnsignedLong(this.requestTimestamp);
        this.writeByte(0); // Secure
    }
}
