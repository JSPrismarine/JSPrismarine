import NetworkPacket from '../NetworkPacket';
import { layoutAt } from '../wire/WireLayout';
import { commandRequestPacket } from '../wire/definitions/commands';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { CommandRequestPayload } from '../wire/definitions/commands';
import type CommandOriginData from '../wire/structures/CommandOriginData';

/**
 * A slash command a client typed.
 *
 * The wire layout lives in {@link commandRequestPacket}: `Command` as a string with its leading
 * slash, `Origin` as a {@link CommandOriginData}, `IsInternal` as a boolean, then `Version` as
 * a string. `Version`
 * refers to the `CurrentCmdVersion` enum, which the schema gives no `Enum-as-Value` option,
 * so the member name travels rather than its number.
 *
 * **Bound To:** Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/command-request-packet/
 */
export default class CommandRequestPacket extends NetworkPacket<CommandRequestPayload> {
    /** Accepts payload data for sending or an encoded buffer for decoding. */
    public constructor(packetData?: CommandRequestPayload | Buffer | null, buffer?: Buffer) {
        if (Buffer.isBuffer(packetData)) {
            super(null, packetData);
        } else {
            super(packetData ?? null, buffer);
        }
    }

    /** Writes the command, origin, internal flag, and command version in docs order. */
    protected serializePayload(stream: NetworkBinaryStream, packetData: CommandRequestPayload): void {
        layoutAt(commandRequestPacket, this.codecProtocol).encode(stream, packetData);
    }

    /** Reads the command, origin, internal flag, and command version in docs order. */
    protected deserializePayload(stream: NetworkBinaryStream): CommandRequestPayload {
        return layoutAt(commandRequestPacket, this.codecProtocol).decode(stream);
    }
}
