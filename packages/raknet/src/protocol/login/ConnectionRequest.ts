import MessageHeaders from '../MessageHeaders.js';
import Packet from '../Packet.js';

export default class ConnectionRequest extends Packet {
    public constructor(buffer?: Buffer) {
        super(MessageHeaders.CONNECTION_REQUEST, buffer);
    }

    public clientGUID!: bigint;
    public requestTimestamp!: bigint;

    public decodePayload(): void {
        this.clientGUID = this.readLong();
        this.requestTimestamp = this.readLong();
        this.readByte(); // Secure
    }

    public encodePayload(): void {
        this.writeLong(this.clientGUID);
        this.writeLong(this.requestTimestamp);
        this.writeByte(0); // Secure
    }
}
