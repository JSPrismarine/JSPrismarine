import { DisconnectReason } from '@jsprismarine/minecraft';
import { disconnectPacket, layoutAt } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * Tells the client why the server is closing the connection.
 *
 * The wire layout lives in `@jsprismarine/protocol`'s `disconnectPacket` definition: `Reason`,
 * then `Skip Message` and the `oneOf<DisconnectPacketMessages, null>` tail it selects.
 *
 * A client that cannot parse this packet shows `initialconnection-90`, the "bad packet" code,
 * instead of the reason the server meant to send.
 */
export default class DisconnectPacket extends FieldNetworkPacket {
    /** The `Reason` enum value. Callers set it; `UNKNOWN` is the zero byte for a packet nobody did. */
    public reason: DisconnectReason = DisconnectReason.UNKNOWN;
    /** `Skip Message`. When true no strings follow and the client shows its own generic text. */
    public skipMessage = false;
    /** The `Message` string, shown on the disconnect screen. */
    public message = '';
    /** The `Filtered Message` string, the same text with chat filtering applied. Empty unless the server filters. */
    public filteredMessage = '';

    public encodePayload(): void {
        layoutAt(disconnectPacket, this.codecProtocol).encode(this, {
            reason: this.reason,
            messages: {
                skipMessage: this.skipMessage,
                message: this.message,
                filteredMessage: this.filteredMessage
            }
        });
    }

    public decodePayload(): void {
        const { reason, messages } = layoutAt(disconnectPacket, this.codecProtocol).decode(this);

        this.reason = reason;
        this.skipMessage = messages.skipMessage;

        if (messages.skipMessage) return;

        this.message = messages.message;
        this.filteredMessage = messages.filteredMessage;
    }
}
