import MessageHeaders from '../MessageHeaders.js';
import Packet from '../Packet.js';

export default class ConnectedPing extends Packet {
    public constructor(buffer: Buffer) {
        super(MessageHeaders.CONNECTED_PING, buffer);
    }

    public clientTimestamp!: bigint;

    public decodePayload(): void {
        this.clientTimestamp = this.readLong();
    }

    public encodePayload(): void {
        this.writeLong(this.clientTimestamp);
    }
}
