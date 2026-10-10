import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/** Which alternative of the messages variant is on the wire. */
const MESSAGES_PRESENT = 0;
const MESSAGES_ABSENT = 1;

/**
 * Why the connection is ending, if the server is willing to say.
 *
 * The messages are a variant rather than a flagged string: an unsigned varint selects between
 * a pair of strings and nothing at all, where 748 had a single boolean and a single string.
 * Both strings are always present when the variant carries them.
 *
 * Getting this wrong is worse than saying nothing. A client that cannot parse a disconnect
 * does not show the reason in it - it reports the packet as malformed, so a player refused for
 * a bad username sees `initialconnection-90`, which is the code for "bad packet" and says
 * nothing about the username.
 */
export default class DisconnectPacket extends DataPacket {
    public static NetID = Identifiers.DisconnectPacket;

    public reason!: number;
    public skipMessage!: boolean;
    public message!: string;
    /** The same message with chat filtering applied. Empty unless the server filters. */
    public filteredMessage = '';

    public encodePayload(): void {
        this.writeVarInt(this.reason);
        this.writeUnsignedVarInt(this.skipMessage ? MESSAGES_ABSENT : MESSAGES_PRESENT);

        if (this.skipMessage) return;

        NetworkUtil.writeString(this, this.message);
        NetworkUtil.writeString(this, this.filteredMessage);
    }

    public decodePayload(): void {
        this.reason = this.readVarInt();
        this.skipMessage = this.readUnsignedVarInt() === MESSAGES_ABSENT;

        if (this.skipMessage) return;

        this.message = NetworkUtil.readString(this);
        this.filteredMessage = NetworkUtil.readString(this);
    }
}
