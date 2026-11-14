/**
 * `CommandBlockUpdatePacket`: the contents of the command block editor, sent when the client
 * closes it.
 *
 * Protocol 2193 and 2225 layout (identical at both): `Target` is a one-of whose varuint32 selector is the legacy "Is Block?"
 * flag (0 for an entity command block, 1 for a placed block). The shared fields follow it in
 * order: four strings, `Track Output`, `Tick Delay` as a little-endian int32, and
 * `Execute On First Tick`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/command-block-update-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { blockPosStructure } from '../structureTypes';

import type { CommandBlockMode } from '../../packet/CommandBlockUpdatePacket';
import type BlockPos from '../../structure/BlockPos';
import type { PayloadOf } from '../define';

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

const commandBlockMode = t.enumOf<CommandBlockMode>(t.varuint32);

/**
 * `Target`: a varuint32 selector, then one alternative. The entity form is an `ActorRuntimeID`
 * varuint64. The block form is a `BlockPos`, the `Command Block Mode` varuint32, and the
 * redstone and conditional booleans. Decoding rejects any other selector.
 */
export const commandBlockTarget = t.custom<CommandBlockTarget>(
    'CommandBlockTarget',
    (stream, value) => {
        if (value.isBlock) {
            t.varuint32.write(stream, 1);
            blockPosStructure.write(stream, value.blockPosition);
            commandBlockMode.write(stream, value.commandBlockMode);
            t.bool.write(stream, value.redstoneMode);
            t.bool.write(stream, value.isConditional);
        } else {
            t.varuint32.write(stream, 0);
            t.varuint64.write(stream, value.targetRuntimeId);
        }
    },
    (stream) => {
        const selector = t.varuint32.read(stream);
        switch (selector) {
            case 0:
                return { isBlock: false, targetRuntimeId: t.varuint64.read(stream) };
            case 1:
                return {
                    isBlock: true,
                    blockPosition: blockPosStructure.read(stream),
                    commandBlockMode: commandBlockMode.read(stream),
                    redstoneMode: t.bool.read(stream),
                    isConditional: t.bool.read(stream)
                };
            default:
                throw new Error(`Unknown command block target alternative ${selector}`);
        }
    }
);

/** The fields the client sends when it closes the command block screen. */
export const commandBlockUpdatePacket = definePacket('CommandBlockUpdatePacket', {
    /** `Target`: the command block minecart or placed command block being edited. */
    target: commandBlockTarget,
    /** `Command`: the command entered in the editor. */
    command: t.string,
    /** `Last Output`: the most recent output shown by the editor. */
    lastOutput: t.string,
    /** `Name`: the name shown above the command block. */
    name: t.string,
    /** `Filtered Name`: the filtered form of the name. */
    filteredName: t.string,
    /** `Track Output`: whether the client wants command output displayed. */
    trackOutput: t.bool,
    /** `Tick Delay`: the delay in ticks between repeating block executions, a little-endian int32. */
    tickDelay: t.li32,
    /** `Execute On First Tick`: whether a repeating block should execute before its first delay. */
    executeOnFirstTick: t.bool
});

/** Payload carried by `CommandBlockUpdatePacket`. */
export type CommandBlockUpdatePayload = PayloadOf<typeof commandBlockUpdatePacket>;
