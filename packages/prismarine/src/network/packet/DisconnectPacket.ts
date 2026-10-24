import { DisconnectReason } from '@jsprismarine/minecraft';
import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * Tells the client why the server is closing the connection.
 *
 * Protocol 2193 layout, in wire order:
 * - `Reason`: a ZigZag varint32 holding a `DisconnectFailReason`, which is `DisconnectReason`
 *   in `@jsprismarine/minecraft`. Members run from `Unknown` (0) to `UnsupportedTransport` (149).
 *   The client maps it to the error code on its disconnect screen.
 * - `Skip Message`: one bool byte. The docs type what follows as
 *   `oneOf<DisconnectPacketMessages, null>` and this byte picks the alternative: false means
 *   the two strings follow, true means null and the packet ends here. The client reads it as
 *   a bool, so any non-zero byte skips.
 * - `Message` and `Filtered Message`: strings, both always present when `Skip Message` is false.
 *
 * A client that cannot parse this packet shows `initialconnection-90`, the "bad packet" code,
 * instead of the reason the server meant to send.
 */
export default class DisconnectPacket extends DataPacket {
    public static NetID = Identifiers.DisconnectPacket;

    /** The `Reason` enum value. Callers set it; `UNKNOWN` is the zero byte for a packet nobody did. */
    public reason: DisconnectReason = DisconnectReason.UNKNOWN;
    /** `Skip Message`. When true no strings follow and the client shows its own generic text. */
    public skipMessage = false;
    /** The `Message` string, shown on the disconnect screen. */
    public message = '';
    /** The `Filtered Message` string, the same text with chat filtering applied. Empty unless the server filters. */
    public filteredMessage = '';

    public encodePayload(): void {
        this.writeVarInt(this.reason);
        this.writeBoolean(this.skipMessage);

        if (this.skipMessage) return;

        NetworkUtil.writeString(this, this.message);
        NetworkUtil.writeString(this, this.filteredMessage);
    }

    public decodePayload(): void {
        this.reason = this.readVarInt();
        this.skipMessage = this.readBoolean();

        if (this.skipMessage) return;

        this.message = NetworkUtil.readString(this);
        this.filteredMessage = NetworkUtil.readString(this);
    }
}
