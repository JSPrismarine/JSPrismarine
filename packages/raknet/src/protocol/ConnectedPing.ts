import Identifiers from './Identifiers';
import Packet from './Packet';

export default class ConnectedPing extends Packet {
    public constructor(buffer: Buffer) {
        super(Identifiers.ConnectedPing, buffer);
    }

    public clientTimestamp!: bigint;

    public decodePayload(): void {
        this.clientTimestamp = this.readLong();
    }

    public encodePayload(): void {
        this.writeLong(this.clientTimestamp);
    }
}
