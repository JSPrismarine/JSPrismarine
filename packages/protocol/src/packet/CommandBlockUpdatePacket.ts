import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import BlockPos from '../structure/BlockPos';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The command block execution mode the client selected; `Normal` is called Impulse in the UI. */
export enum CommandBlockMode {
    Normal = 0,
    Repeating = 1,
    Chain = 2
}

/** The entity or block targeted by a command block update. */
export type CommandBlockTarget =
    | { isBlock: false; targetRuntimeId: bigint }
    | {
          isBlock: true;
          blockPosition: BlockPos;
          commandBlockMode: CommandBlockMode;
          redstoneMode: boolean;
          isConditional: boolean;
      };

/** The fields the client sends when it closes the command block screen. */
export interface CommandBlockUpdate {
    /** The command block minecart or placed command block being edited. */
    target: CommandBlockTarget;
    /** Command entered in the editor. */
    command: string;
    /** Most recent output shown by the editor. */
    lastOutput: string;
    /** Name shown above the command block. */
    name: string;
    /** Filtered form of the name. */
    filteredName: string;
    /** Whether the client wants command output displayed. */
    trackOutput: boolean;
    /** Delay in ticks between repeating block executions. */
    tickDelay: number;
    /** Whether a repeating block should execute before its first delay. */
    executeOnFirstTick: boolean;
}

/**
 * Reports the contents of the command block editor when the client closes it.
 *
 * Protocol 2193 layout: `Target` is a one-of whose varuint32 selector is the legacy “Is
 * Block?” flag (0 for an entity command block, 1 for a placed block). The entity form contains
 * an `ActorRuntimeID` varuint64. The block form contains a `BlockPos` of three ZigZag
 * varint32s, `Command Block Mode` as a varuint32, and the redstone and conditional booleans.
 * The shared fields follow in order: four strings, `Track Output`, `Tick Delay` as a
 * little-endian int32, and `Execute On First Tick`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/command-block-update-packet/
 */
export default class CommandBlockUpdatePacket extends NetworkPacket<CommandBlockUpdate> {
    public get id(): number {
        return PacketIdentifier.COMMAND_BLOCK_UPDATE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CommandBlockUpdate): void {
        if (data.target.isBlock) {
            stream.writeUnsignedVarInt(1);
            data.target.blockPosition.serialize(stream);
            stream.writeUnsignedVarInt(data.target.commandBlockMode);
            stream.writeBoolean(data.target.redstoneMode);
            stream.writeBoolean(data.target.isConditional);
        } else {
            stream.writeUnsignedVarInt(0);
            stream.writeUnsignedVarLong(data.target.targetRuntimeId);
        }

        stream.writeString(data.command);
        stream.writeString(data.lastOutput);
        stream.writeString(data.name);
        stream.writeString(data.filteredName);
        stream.writeBoolean(data.trackOutput);
        stream.writeIntLE(data.tickDelay);
        stream.writeBoolean(data.executeOnFirstTick);
    }

    protected deserializePayload(stream: NetworkBinaryStream): CommandBlockUpdate {
        const selector = stream.readUnsignedVarInt();
        let target: CommandBlockTarget;
        switch (selector) {
            case 0:
                target = { isBlock: false, targetRuntimeId: stream.readUnsignedVarLong() };
                break;
            case 1: {
                const blockPosition = new BlockPos(0, 0, 0);
                blockPosition.deserialize(stream);
                target = {
                    isBlock: true,
                    blockPosition,
                    commandBlockMode: stream.readUnsignedVarInt(),
                    redstoneMode: stream.readBoolean(),
                    isConditional: stream.readBoolean()
                };
                break;
            }
            default:
                throw new Error(`Unknown command block target alternative ${selector}`);
        }

        return {
            target,
            command: stream.readString(),
            lastOutput: stream.readString(),
            name: stream.readString(),
            filteredName: stream.readString(),
            trackOutput: stream.readBoolean(),
            tickDelay: stream.readIntLE(),
            executeOnFirstTick: stream.readBoolean()
        };
    }
}
