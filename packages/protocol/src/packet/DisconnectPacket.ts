import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { disconnectPacket } from '../wire/definitions/disconnect';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { DisconnectPayload } from '../wire/definitions/disconnect';

/** The fields of a `DisconnectPacket`, in wire order. */
export type Disconnect = DisconnectPayload;

/**
 * Tells the client why the server is closing the connection.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/disconnect-packet/
 *
 * Layout at protocols 2193 and 2225, in wire order:
 * - `Reason`: a ZigZag varint32 holding a `DisconnectFailReason`, which is `DisconnectReason`
 *   in `@jsprismarine/minecraft`. Members run from `Unknown` (0) to `UnsupportedTransport` (149)
 *   at 2193 and to `SubClientLoginNotBound` (150) at 2225; the encoding is the same.
 * - `Skip Message`: one bool byte. The docs type what follows as
 *   `oneOf<DisconnectPacketMessages, null>` and this byte picks the alternative: false means
 *   the two strings follow, true means null and the packet ends here. The client reads it as
 *   a bool, so any non-zero byte skips.
 * - `Message` and `Filtered Message`: strings, both always present when `Skip Message` is false.
 *
 * The payload carries the last three fields as `messages`. Reading only one string after a false
 * `Skip Message` leaves the cursor inside the second string, so the next packet in the batch
 * decodes as garbage.
 */
export default class DisconnectPacket extends NetworkPacket<Disconnect> {
    public get id(): number {
        return PacketIdentifier.DISCONNECT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: Disconnect): void {
        layoutAt(disconnectPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): Disconnect {
        return layoutAt(disconnectPacket, this.codecProtocol).decode(stream);
    }
}
