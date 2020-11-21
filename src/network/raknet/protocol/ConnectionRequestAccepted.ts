import Identifiers from './Identifiers';
import InetAddress from '../utils/InetAddress';
import Packet from './Packet';

export default class ConnectionRequestAccepted extends Packet {
    public constructor() {
        super(Identifiers.ConnectionRequestAccepted);
    }

    public clientAddress!: InetAddress;
    public requestTimestamp!: bigint;
    public acceptedTimestamp!: bigint;

    public decodePayload(): void {
        this.clientAddress = this.readAddress();
        this.readShort(); // unknown
        for (let i = 0; i < 20; i++) {
            this.readAddress();
        }
        this.requestTimestamp = this.readLong();
        this.acceptedTimestamp = this.readLong();
    }

    public encodePayload(): void {
        this.writeAddress(this.clientAddress);
        this.writeShort(0); // unknown
        let sysAddresses = [new InetAddress('127.0.0.1', 0, 4)];
        for (let i = 0; i < 20; i++) {
            this.writeAddress(
                sysAddresses[i] ?? new InetAddress('0.0.0.0', 0, 4)
            );
        }
        this.writeLong(this.requestTimestamp);
        this.writeLong(this.acceptedTimestamp);
    }
}
