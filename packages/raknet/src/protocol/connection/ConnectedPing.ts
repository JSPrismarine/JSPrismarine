import { MessageIdentifiers } from '../MessageIdentifiers';
import Packet from '../Packet';

/**
 * A keepalive sent inside the connection.
 *
 * Wire layout: id, then `clientTimestamp` as an unsigned 64 bit `RakNet::Time`.
 */
export default class ConnectedPing extends Packet {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.CONNECTED_PING, buffer);
    }

    public clientTimestamp!: bigint;

    public decodePayload(): void {
        this.clientTimestamp = this.readUnsignedLong();
    }

    public encodePayload(): void {
        this.writeUnsignedLong(this.clientTimestamp);
    }
}
