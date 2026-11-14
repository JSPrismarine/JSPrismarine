import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { commandBlockUpdatePacket } from '../wire/definitions/commandBlockUpdate';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type {
    CommandBlockTarget as WireCommandBlockTarget,
    CommandBlockUpdatePayload
} from '../wire/definitions/commandBlockUpdate';

/** The command block execution mode the client selected; `Normal` is called Impulse in the UI. */
export enum CommandBlockMode {
    Normal = 0,
    Repeating = 1,
    Chain = 2
}

/** The entity or block targeted by a command block update. */
export type CommandBlockTarget = WireCommandBlockTarget;

/** The fields the client sends when it closes the command block screen. */
export type CommandBlockUpdate = CommandBlockUpdatePayload;

/**
 * Reports the contents of the command block editor when the client closes it.
 *
 * Protocol 2193 and 2225 layout (identical at both): `Target` is a one-of whose varuint32 selector is the legacy “Is
 * Block?” flag (0 for an entity command block, 1 for a placed block). The entity form contains
 * an `ActorRuntimeID` varuint64. The block form contains a `BlockPos` of three ZigZag
 * varint32s, `Command Block Mode` as a varuint32, and the redstone and conditional booleans.
 * The shared fields follow in order: four strings, `Track Output`, `Tick Delay` as a
 * little-endian int32, and `Execute On First Tick`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/command-block-update-packet/
 */
export default class CommandBlockUpdatePacket extends NetworkPacket<CommandBlockUpdate> {
    public get id(): number {
        return PacketIdentifier.COMMAND_BLOCK_UPDATE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CommandBlockUpdate): void {
        layoutAt(commandBlockUpdatePacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): CommandBlockUpdate {
        return layoutAt(commandBlockUpdatePacket, this.codecProtocol).decode(stream);
    }
}
