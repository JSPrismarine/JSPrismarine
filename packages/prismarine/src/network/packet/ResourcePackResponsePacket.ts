import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/** The one status whose alternative carries a list: what the client is still downloading. */
const SEND_PACKS = 2;

/**
 * The alternatives, in selector order, spelled as the wire spells them.
 *
 * Lower case and run together, and sent in full beside the number that already identifies
 * them. Not derivable from the status names: `SendPacks` travels as `downloading`.
 */
const ALTERNATIVE_NAMES = ['cancel', 'downloading', 'downloadingfinished', 'resourcepackstackfinished'];

/**
 * The client's answer to the pack exchange.
 *
 * The status is a variant, and it names itself twice: a zero based selector, then the
 * alternative's own name as a string. The status enum counts from one, so the selector is one
 * less than it. Only `SendPacks` is followed by a list - 748 wrote one unconditionally, and
 * the two bytes of an empty one now land in the middle of whatever follows.
 *
 * Mojang's published table shows a `Response Type` byte inside each alternative as well. It is
 * not on the wire: a real client sends the selector and the name and nothing else, which is
 * what a server has to read to keep up with one.
 */
export default class ResourcePackResponsePacket extends DataPacket {
    public static NetID = Identifiers.ResourcePackResponsePacket;

    public status!: number;
    public packIds: string[] = [];

    public decodePayload(): void {
        this.status = this.readUnsignedVarInt() + 1;
        NetworkUtil.readString(this);

        if (this.status !== SEND_PACKS) return;

        let entryCount = this.readUnsignedVarInt();
        while (entryCount-- > 0) {
            this.packIds.push(NetworkUtil.readString(this));
        }
    }

    /**
     * The mirror of {@link decodePayload}, which it did not used to be: a second
     * `writeUnsignedShortLE(0)` sat in front of the count, so what this wrote could not be
     * read back by the method directly above it.
     *
     * Latent while nothing encoded this - it only ever travels client to server, so the
     * server decodes and never writes one. It stops being latent the moment a client in this
     * repository sends one, which is now.
     */
    public encodePayload(): void {
        const selector = this.status - 1;
        const name = ALTERNATIVE_NAMES[selector];
        if (name === undefined) throw new Error(`No resource pack response alternative for status ${this.status}`);

        this.writeUnsignedVarInt(selector);
        NetworkUtil.writeString(this, name);

        if (this.status !== SEND_PACKS) return;

        this.writeUnsignedVarInt(this.packIds.length);
        this.packIds.forEach((id) => {
            NetworkUtil.writeString(this, id);
        });
    }
}
