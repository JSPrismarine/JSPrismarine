import type {
    CommandBlockEdit,
    CommandBlockMode as BehaviorMode
} from '@jsprismarine/block-behaviors/families/commandBlock';
import { editCommandBlock } from '@jsprismarine/block-behaviors/families/commandBlock';
import type CommandBlockUpdatePacket from '@jsprismarine/protocol/bedrock/packet/CommandBlockUpdatePacket';
import { CommandBlockMode } from '@jsprismarine/protocol/bedrock/packet/CommandBlockUpdatePacket';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

import { mayEditCommandBlocks } from '../../command/commandBlockAccess';
import BlockPosition from '../../world/BlockPosition';
import { blockTargetRejection } from './BlockTarget';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

/** The blocks whose screen sends this packet. */
const COMMAND_BLOCKS: ReadonlySet<string> = new Set([
    'minecraft:command_block',
    'minecraft:repeating_command_block',
    'minecraft:chain_command_block'
]);

/** The screen's mode, in the behavior family's words. */
const MODES: Readonly<Record<CommandBlockMode, BehaviorMode>> = {
    [CommandBlockMode.Normal]: 'impulse',
    [CommandBlockMode.Repeating]: 'repeat',
    [CommandBlockMode.Chain]: 'chain'
};

/**
 * A player's edit of a command block or a command block minecart, sent when they close its screen.
 *
 * Only an operator in creative mode may edit one, as Java's `canUseGameMasterBlocks` has it; an
 * edit from anybody else, or of a block out of reach or no longer a command block, is dropped at
 * verbose level. A block takes the mode, the command and its options, and starts when it became
 * always active. A cart keeps the command it runs over a powered activator rail.
 */
export default class CommandBlockUpdateHandler implements InputLaneHandler<CommandBlockUpdatePacket> {
    public static PacketName = 'CommandBlockUpdatePacket';
    public readonly phases = ['play'] as const;
    // Changes a block and its block entity, or a cart's stored command.
    public readonly lane = 'input';

    /** Applies the edit, or drops one the sender may not make. */
    public handle(packet: CommandBlockUpdatePacket, { session, log, services }: InputContext): undefined {
        const data = packet.getPacketData();
        if (data === null) throw new PrismarineNetworkErrors.CommandBlockUpdateNotDecoded();
        const name = session.identity.name;

        if (!mayEditCommandBlocks(session)) {
            log.verbose(`Dropped a command block edit from ${name}: only an operator in creative mode may make one`);
            return;
        }

        const { target } = data;
        if (!target.isBlock) {
            const taken = session.getWorld().dataEntities().runtime.setMinecartCommand(Number(target.targetRuntimeId), {
                command: data.command,
                customName: data.name,
                trackOutput: data.trackOutput
            });
            if (!taken)
                log.verbose(
                    `Dropped a command block edit from ${name}: ${target.targetRuntimeId} is no command block minecart`
                );
            return;
        }

        const { x, y, z } = target.blockPosition;
        const rejection = blockTargetRejection(session, new BlockPosition(x, y, z), COMMAND_BLOCKS);
        if (rejection !== null) {
            log.verbose(`Dropped a command block edit from ${name} at ${x}, ${y}, ${z}: ${rejection}`);
            return;
        }

        const world = session.getWorld();
        const edit: CommandBlockEdit = {
            mode: MODES[target.commandBlockMode] ?? 'impulse',
            conditional: target.isConditional,
            needsRedstone: target.redstoneMode,
            command: data.command,
            customName: data.name,
            trackOutput: data.trackOutput,
            tickDelay: data.tickDelay,
            executeOnFirstTick: data.executeOnFirstTick
        };
        editCommandBlock(
            services.content.world.blockWorld.at(world.getDimension().name, world.getLevel().name),
            { x, y, z },
            edit
        );
    }
}
