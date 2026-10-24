import type { DisconnectReason } from '@jsprismarine/minecraft';
import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `DisconnectPacket`, in wire order. */
export interface Disconnect {
    /** The `Reason` enum value. The client maps it to the error code on its disconnect screen. */
    reason: DisconnectReason;
    /** `Skip Message`. When true no strings are on the wire and the client shows its own generic text. */
    skipMessage: boolean;
    /** The `Message` string. Written as an empty string when absent and `skipMessage` is false. */
    message?: string;
    /** The `Filtered Message` string, the same text with chat filtering applied. Empty unless the server filters. */
    filteredMessage?: string;
}

/**
 * Tells the client why the server is closing the connection.
 *
 * Protocol 2193 layout, in wire order:
 * - `Reason`: a ZigZag varint32 holding a `DisconnectFailReason`, which is `DisconnectReason`
 *   in `@jsprismarine/minecraft`. Members run from `Unknown` (0) to `UnsupportedTransport` (149).
 * - `Skip Message`: one bool byte. The docs type what follows as
 *   `oneOf<DisconnectPacketMessages, null>` and this byte picks the alternative: false means
 *   the two strings follow, true means null and the packet ends here. The client reads it as
 *   a bool, so any non-zero byte skips.
 * - `Message` and `Filtered Message`: strings, both always present when `Skip Message` is false.
 *
 * Reading only one string after a false `Skip Message` leaves the cursor inside the second
 * string, so the next packet in the batch decodes as garbage.
 */
export default class DisconnectPacket extends NetworkPacket<Disconnect> {
    public get id(): number {
        return PacketIdentifier.DISCONNECT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: Disconnect): void {
        stream.writeVarInt(data.reason);
        stream.writeBoolean(data.skipMessage);

        if (data.skipMessage) return;

        stream.writeString(data.message ?? '');
        stream.writeString(data.filteredMessage ?? '');
    }

    protected deserializePayload(stream: NetworkBinaryStream): Disconnect {
        const reason: DisconnectReason = stream.readVarInt();
        const skipMessage = stream.readBoolean();

        if (skipMessage) return { reason, skipMessage };

        return {
            reason,
            skipMessage,
            message: stream.readString(),
            filteredMessage: stream.readString()
        };
    }
}
