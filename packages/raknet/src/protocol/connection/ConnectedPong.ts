import { MessageIdentifiers } from '../MessageIdentifiers';
import Packet from '../Packet';

export default class ConnectedPong extends Packet {
    public constructor() {
        super(MessageIdentifiers.CONNECTED_PONG);
    }

    public clientTimestamp!: bigint;
    public serverTimestamp!: bigint;

    public encodePayload(): void {
        this.writeLong(this.clientTimestamp);
        this.writeLong(this.serverTimestamp);
    }
}
