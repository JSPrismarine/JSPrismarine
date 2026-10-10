import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * Which alternative of the messages variant is on the wire.
 *
 * Written as an unsigned varint, not the `uint32` the published table names: the documented
 * width is the type of the discriminator in the game's own source, and the encoder writes it
 * varint like every other one. A real server's refusal is three bytes - the selector and two
 * empty strings - which is what settled it.
 */
const MESSAGES_PRESENT = 0;
const MESSAGES_ABSENT = 1;

export interface Disconnect {
    reason: number;
    /** When set, the client shows its own generic text and no message is on the wire. */
    skipMessage: boolean;
    message?: string;
    /** The same message with chat filtering applied. Empty unless the server filters. */
    filteredMessage?: string;
}

/**
 * Why the connection is ending, if the server is willing to say.
 *
 * The messages are a variant rather than a flagged string: a `uint32` selects between a pair
 * of strings and nothing at all, where this used to be a single boolean and a single string.
 * Both fields are always present when the variant carries them, so reading one and stopping
 * walks the cursor into whatever follows in the batch - which is how a disconnect that says
 * why comes out looking like one that says nothing.
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
        const reason = stream.readVarInt();
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
