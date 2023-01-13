import MessageHeaders from '../MessageHeaders.js';
import Packet from '../Packet.js';

export default class ConnectedPong extends Packet {
    public constructor() {
        super(MessageHeaders.CONNECTED_PONG);
    }

    public clientTimestamp!: bigint;
    public serverTimestamp!: bigint;

    public encodePayload(): void {
        this.writeLong(this.clientTimestamp);
        this.writeLong(this.serverTimestamp);
    }
}
