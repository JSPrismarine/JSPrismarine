import NetworkPacket from '../NetworkPacket';
import { layoutAt } from '../wire/WireLayout';
import { commandOutputPacket } from '../wire/definitions/commands';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { CommandOutputPayload } from '../wire/definitions/commands';

/**
 * The output of a command, sent back to whoever asked for it.
 *
 * A command may come from a websocket server or a command block rather than from the player,
 * so the reply repeats the `CommandOriginData` of the request instead of assuming the chat
 * window. A server that answers every command with a `TextPacket` sends the output to the
 * wrong place for every origin that is not the player.
 *
 * The wire layout lives in {@link commandOutputPacket}: `Origin Data`, then the output type's
 * name as a string, `Success Count` as a uint32 LE, `Output Messages` as a counted list, and
 * `Data Set` as an optional string.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/command-output-packet/
 */
export default class CommandOutputPacket extends NetworkPacket<CommandOutputPayload> {
    /** Accepts payload data for sending or an encoded buffer for decoding. */
    public constructor(packetData?: CommandOutputPayload | Buffer | null, buffer?: Buffer) {
        if (Buffer.isBuffer(packetData)) {
            super(null, packetData);
        } else {
            super(packetData ?? null, buffer);
        }
    }

    /** Writes the origin, result type, success count, messages, and optional data set. */
    protected serializePayload(stream: NetworkBinaryStream, packetData: CommandOutputPayload): void {
        layoutAt(commandOutputPacket, this.codecProtocol).encode(stream, packetData);
    }

    /** Reads the origin and output; unknown output type names decode as `None`. */
    protected deserializePayload(stream: NetworkBinaryStream): CommandOutputPayload {
        return layoutAt(commandOutputPacket, this.codecProtocol).decode(stream);
    }
}
