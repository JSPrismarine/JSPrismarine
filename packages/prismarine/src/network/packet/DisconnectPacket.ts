import { DisconnectReason } from '@jsprismarine/minecraft';
import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * Which alternative of `Messages` is on the wire. The docs type it as
 * `oneOf<DisconnectPacketMessages, null>`: 0 selects the two strings, 1 selects null.
 */
const MESSAGES_PRESENT = 0;
const MESSAGES_ABSENT = 1;

/**
 * Tells the client why the server is closing the connection.
 *
 * Wire layout at protocol 2193:
 * - `Reason`: a ZigZag varint32 holding a `DisconnectFailReason`, which is `DisconnectReason`
 *   in `@jsprismarine/minecraft`. The client maps it to the error code on its disconnect screen.
 * - `Messages`: `oneOf<DisconnectPacketMessages, null>`. A one-byte selector, 0 for the
 *   messages and 1 for null. Alternative 0 is followed by `Message` and `Filtered Message`,
 *   both strings and both always written. Alternative 1 is followed by nothing.
 *
 * We write the selector as an unsigned varint. gophertunnel writes it as a bool named
 * `HideDisconnectionScreen`. For 0 and 1 the byte is the same, so the two layouts agree.
 *
 * A client that cannot parse this packet shows `initialconnection-90`, the "bad packet" code,
 * instead of the reason the server meant to send.
 */
export default class DisconnectPacket extends DataPacket {
    public static NetID = Identifiers.DisconnectPacket;

    /** The `Reason` enum value. `UNKNOWN` writes a zero byte, which is what the server has always sent. */
    public reason: DisconnectReason = DisconnectReason.UNKNOWN;
    /** When set, `Messages` selects null and no strings follow. */
    public skipMessage!: boolean;
    /** The `Message` string, shown on the disconnect screen. */
    public message = '';
    /** The `Filtered Message` string, the same text with chat filtering applied. Empty unless the server filters. */
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
