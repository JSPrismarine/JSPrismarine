import { MAXIMUM_NUMBER_OF_INTERNAL_IDS } from '../../Constants';
import InetAddress from '../../utils/InetAddress';
import { MessageIdentifiers } from '../MessageIdentifiers';
import Packet from '../Packet';

/** What RakNet writes for an internal address it has nothing to report for. */
const UNASSIGNED_SYSTEM_ADDRESS = new InetAddress('0.0.0.0', 0, 4);

/** The internal addresses written when the caller supplies none: loopback, then empty slots. */
const DEFAULT_SYSTEM_ADDRESSES = [new InetAddress('127.0.0.1', 0, 4)];

/**
 * The server's answer to `ConnectionRequest`.
 *
 * Wire layout: id, the `clientAddress` as the server sees it, `systemIndex` as an unsigned
 * big-endian short, {@link MAXIMUM_NUMBER_OF_INTERNAL_IDS} internal addresses of the
 * server, then `requestTimestamp` echoed from the request and `acceptedTimestamp`, both
 * unsigned 64 bit. The client keeps the internal addresses but Bedrock does nothing with
 * them, so a server that supplies none sends loopback followed by unassigned slots.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L3540
 */
export default class ConnectionRequestAccepted extends Packet {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.CONNECTION_REQUEST_ACCEPTED, buffer);
    }

    public clientAddress!: InetAddress;
    /** RakNet's index for the client in its remote system list; 0 here, which nothing reads. */
    public systemIndex = 0;
    public systemAddresses: InetAddress[] = [];
    public requestTimestamp!: bigint;
    public acceptedTimestamp!: bigint;

    public decodePayload(): void {
        this.clientAddress = this.readAddress();
        this.systemIndex = this.readUnsignedShort();

        this.systemAddresses = [];
        for (let i = 0; i < MAXIMUM_NUMBER_OF_INTERNAL_IDS; i++) {
            this.systemAddresses.push(this.readAddress());
        }

        this.requestTimestamp = this.readUnsignedLong();
        this.acceptedTimestamp = this.readUnsignedLong();
    }

    public encodePayload(): void {
        this.writeAddress(this.clientAddress);
        this.writeUnsignedShort(this.systemIndex);

        const systemAddresses = this.systemAddresses.length > 0 ? this.systemAddresses : DEFAULT_SYSTEM_ADDRESSES;
        for (let i = 0; i < MAXIMUM_NUMBER_OF_INTERNAL_IDS; i++) {
            this.writeAddress(systemAddresses[i] ?? UNASSIGNED_SYSTEM_ADDRESS);
        }

        this.writeUnsignedLong(this.requestTimestamp);
        this.writeUnsignedLong(this.acceptedTimestamp);
    }
}
