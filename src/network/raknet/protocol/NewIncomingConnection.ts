import InetAddress from '../utils/InetAddress';
import Identifiers from './Identifiers';
import Packet from './Packet';

export default class NewIncomingConnection extends Packet {
    public constructor(buffer: Buffer) {
        super(Identifiers.NewIncomingConnection, buffer);
    }

    public address!: InetAddress;
    public systemAddresses: Array<InetAddress> = [];

    public requestTimestamp!: bigint;
    public acceptedTimestamp!: bigint;

    public decodePayload(): void {
        this.address = this.readAddress();

        // Do not save in memory stuff we will not use
        for (let i = 0; i < 20; i++) {
            this.systemAddresses.push(this.readAddress());
        }

        this.requestTimestamp = this.readLong();
        this.acceptedTimestamp = this.readLong();
    }

    public encodePayload(): void {
        this.writeAddress(this.address);
        this.systemAddresses.map((address) => this.writeAddress(address));
        this.writeLong(this.requestTimestamp);
        this.writeLong(this.acceptedTimestamp);
    }
}
