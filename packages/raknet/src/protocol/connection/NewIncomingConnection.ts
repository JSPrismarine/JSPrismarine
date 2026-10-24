import { MAXIMUM_NUMBER_OF_INTERNAL_IDS } from '../../Constants';
import InetAddress from '../../utils/InetAddress';
import { MessageIdentifiers } from '../MessageIdentifiers';
import Packet from '../Packet';

/** What RakNet writes for an internal address it has nothing to report for. */
const UNASSIGNED_SYSTEM_ADDRESS = new InetAddress('0.0.0.0', 0, 4);

/**
 * The client's last word in the handshake, answering `ConnectionRequestAccepted`.
 *
 * Wire layout: id, the server's `address` as the client sees it, then
 * {@link MAXIMUM_NUMBER_OF_INTERNAL_IDS} internal addresses of the client, then
 * `requestTimestamp` and `acceptedTimestamp` echoed from the acceptance, both unsigned
 * 64 bit. The internal addresses are parsed one by one rather than skipped as a block: an
 * IPv4 record is 7 bytes and an IPv6 record 29, so their total length is only known once
 * each version byte has been read.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L6194
 */
export default class NewIncomingConnection extends Packet {
    public constructor(buffer?: Buffer) {
        super(MessageIdentifiers.NEW_INCOMING_CONNECTION, buffer);
    }

    public address!: InetAddress;
    public systemAddresses: InetAddress[] = [];

    public requestTimestamp!: bigint;
    public acceptedTimestamp!: bigint;

    public decodePayload(): void {
        this.address = this.readAddress();

        this.systemAddresses = [];
        for (let i = 0; i < MAXIMUM_NUMBER_OF_INTERNAL_IDS; i++) {
            this.systemAddresses.push(this.readAddress());
        }

        this.requestTimestamp = this.readUnsignedLong();
        this.acceptedTimestamp = this.readUnsignedLong();
    }

    /**
     * The remote's address, then our own internal ones - not the remote's address twenty
     * one times, which is what this wrote until the outgoing client needed it. Missing
     * internal addresses are written unassigned, as RakNet writes an empty slot.
     */
    public encodePayload(): void {
        this.writeAddress(this.address);
        for (let i = 0; i < MAXIMUM_NUMBER_OF_INTERNAL_IDS; i++) {
            this.writeAddress(this.systemAddresses[i] ?? UNASSIGNED_SYSTEM_ADDRESS);
        }

        this.writeUnsignedLong(this.requestTimestamp);
        this.writeUnsignedLong(this.acceptedTimestamp);
    }
}
