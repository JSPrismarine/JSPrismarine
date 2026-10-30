/**
 * Closes a connection with a disconnect reason and an optional pair of displayed messages.
 * The selector determines whether the packet carries the message strings.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/disconnect-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';
import type { WireType } from '../fieldTypes';

/** The `oneOf<DisconnectPacketMessages, null>` tail, with the byte that selects it. */
export interface DisconnectMessages {
    /** `Skip Message`: true picks the null alternative and the packet ends after this byte. */
    skipMessage: boolean;
    /** `Message`, shown on the disconnect screen. Not on the wire when `skipMessage` is true. */
    message: string;
    /** `Filtered Message`: the same text with chat filtering applied. */
    filteredMessage: string;
}

/**
 * `Skip Message` and the message pair it selects.
 *
 * The docs type the tail as `oneOf<DisconnectPacketMessages, null>` with a bool picking the
 * alternative, so which fields travel is decided by the answer itself rather than by the
 * protocol version: the branch belongs in this wire type, not in a gate. The client reads the
 * selector as a bool, so any non-zero byte skips. Writing only one of the two strings leaves a
 * real client's cursor inside the second one and the rest of the batch decodes as garbage.
 */
const disconnectMessages: WireType<DisconnectMessages> = t.custom(
    'oneOf<DisconnectPacketMessages, null>',
    (stream, value) => {
        t.bool.write(stream, value.skipMessage);

        if (value.skipMessage) return;

        t.string.write(stream, value.message);
        t.string.write(stream, value.filteredMessage);
    },
    (stream) => {
        const skipMessage = t.bool.read(stream);

        if (skipMessage) return { skipMessage, message: '', filteredMessage: '' };

        return { skipMessage, message: t.string.read(stream), filteredMessage: t.string.read(stream) };
    }
);

/** The `DisconnectPacket` field list. */
export const disconnectPacket = definePacket('DisconnectPacket', {
    /**
     * `Reason`: a `DisconnectFailReason`, which is `DisconnectReason` in `@jsprismarine/minecraft`.
     * Members run from `Unknown` (0) to `UnsupportedTransport` (149). The client maps it to the
     * error code on its disconnect screen.
     */
    reason: t.varint32,
    /** `Skip Message` and, unless it is set, the two message strings. */
    messages: disconnectMessages
});

/** Closes the connection with a reason and optional plain and filtered display messages. */
export type DisconnectPayload = PayloadOf<typeof disconnectPacket>;
