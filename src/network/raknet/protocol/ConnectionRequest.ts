import Identifiers from './Identifiers';
import Packet from './Packet';

export default class ConnectionRequest extends Packet {
    public constructor(buffer?: Buffer) {
        super(Identifiers.ConnectionRequest, buffer);
    }

    public clientGUID!: bigint;
    public requestTimestamp!: bigint;

    public decodePayload(): void {
        this.clientGUID = this.readLong();
        this.requestTimestamp = this.readLong();
        this.readByte(); // secure
    }

    public encodePayload(): void {
        this.writeLong(this.clientGUID);
        this.writeLong(this.requestTimestamp);
        this.writeByte(0); // secure
    }
}
