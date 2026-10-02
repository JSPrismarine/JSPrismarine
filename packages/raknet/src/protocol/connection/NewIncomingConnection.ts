import InetAddress from '../../utils/InetAddress';
import { MessageIdentifiers } from '../MessageIdentifiers';
import Packet from '../Packet';

/**
 * How many internal addresses follow the remote one. RakNet fixes this at compile time and
 * both peers must agree on it, so it is not derived from {@link NewIncomingConnection.systemAddresses}.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakNetDefines.h#L149 (MAXIMUM_NUMBER_OF_INTERNAL_IDS)
 */
const SYSTEM_ADDRESS_COUNT = 20;

/** What RakNet writes for an internal address it has nothing to report for. */
const UNASSIGNED_SYSTEM_ADDRESS = new InetAddress('0.0.0.0', 0, 4);

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

        // Do not save in memory stuff we will not use
        // TODO: skip bytes (inet addr * 20 bytes)
        for (let i = 0; i < SYSTEM_ADDRESS_COUNT; i++) {
            this.systemAddresses.push(this.readAddress());
        }

        this.requestTimestamp = this.readLong();
        this.acceptedTimestamp = this.readLong();
    }

    /**
     * The remote's address, then our own internal ones - not the remote's address twenty
     * one times, which is what this wrote until the outgoing client needed it.
     *
     * Latent for as long as JSPrismarine was the only thing decoding this: it reads the
     * twenty addresses purely to advance past them and never looks at what they hold. A
     * real server does look, and the shape has to be right before we send it one.
     */
    public encodePayload(): void {
        this.writeAddress(this.address);
        for (let i = 0; i < SYSTEM_ADDRESS_COUNT; i++) {
            this.writeAddress(this.systemAddresses[i] ?? UNASSIGNED_SYSTEM_ADDRESS);
        }

        this.writeLong(this.requestTimestamp);
        this.writeLong(this.acceptedTimestamp);
    }
}
