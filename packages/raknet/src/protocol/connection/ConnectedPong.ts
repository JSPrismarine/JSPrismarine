import { MessageIdentifiers } from '../MessageIdentifiers';
import Packet from '../Packet';

export default class ConnectedPong extends Packet {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.CONNECTED_PONG, buffer);
    }

    public clientTimestamp!: bigint;
    public serverTimestamp!: bigint;

    public decodePayload(): void {
        this.clientTimestamp = this.readLong();
        this.serverTimestamp = this.readLong();
    }

    public encodePayload(): void {
        this.writeLong(this.clientTimestamp);
        this.writeLong(this.serverTimestamp);
    }
}
