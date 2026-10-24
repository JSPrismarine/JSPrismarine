import type { DisconnectReason } from '@jsprismarine/minecraft';
import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * Which alternative of `Messages` is on the wire. The docs type it as
 * `oneOf<DisconnectPacketMessages, null>`: 0 selects the two strings, 1 selects null.
 *
 * We write the selector as an unsigned varint. gophertunnel writes it as a bool named
 * `HideDisconnectionScreen`. For 0 and 1 the byte is the same, so the two layouts agree.
 */
const MESSAGES_PRESENT = 0;
const MESSAGES_ABSENT = 1;

/** The fields of a `DisconnectPacket`. */
export interface Disconnect {
    /** The `Reason` enum value. The client maps it to the error code on its disconnect screen. */
    reason: DisconnectReason;
    /** When set, `Messages` selects null, no strings are on the wire, and the client shows its own generic text. */
    skipMessage: boolean;
    /** The `Message` string. Written as an empty string when absent and `skipMessage` is false. */
    message?: string;
    /** The `Filtered Message` string, the same text with chat filtering applied. Empty unless the server filters. */
    filteredMessage?: string;
}

/**
 * Tells the client why the server is closing the connection.
 *
 * Wire layout at protocol 2193:
 * - `Reason`: a ZigZag varint32 holding a `DisconnectFailReason`, which is `DisconnectReason`
 *   in `@jsprismarine/minecraft`.
 * - `Messages`: `oneOf<DisconnectPacketMessages, null>`. A one-byte selector, 0 for the
 *   messages and 1 for null. Alternative 0 is followed by `Message` and `Filtered Message`,
 *   both strings and both always written. Alternative 1 is followed by nothing.
 *
 * Reading only one string after selector 0 leaves the cursor inside the second string, so
 * the next packet in the batch decodes as garbage.
 */
export default class DisconnectPacket extends NetworkPacket<Disconnect> {
    public get id(): number {
        return PacketIdentifier.DISCONNECT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: Disconnect): void {
        stream.writeVarInt(data.reason);
        stream.writeUnsignedVarInt(data.skipMessage ? MESSAGES_ABSENT : MESSAGES_PRESENT);

        if (data.skipMessage) return;

        stream.writeString(data.message ?? '');
        stream.writeString(data.filteredMessage ?? '');
    }

    protected deserializePayload(stream: NetworkBinaryStream): Disconnect {
        const reason: DisconnectReason = stream.readVarInt();
        const skipMessage = stream.readUnsignedVarInt() === MESSAGES_ABSENT;

        if (skipMessage) return { reason, skipMessage };

        return {
            reason,
            skipMessage,
            message: stream.readString(),
            filteredMessage: stream.readString()
        };
    }
}
