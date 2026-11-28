import { describe, expect, it } from 'vitest';

import { commandBlockStateOf } from '@jsprismarine/block-behaviors/families/commandBlock';
import { createVoxelWorld } from '@jsprismarine/block-behaviors';
import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { Gametype } from '@jsprismarine/minecraft';
import BlockPos from '@jsprismarine/protocol/bedrock/structure/BlockPos';
import CommandBlockUpdatePacket, {
    CommandBlockMode
} from '@jsprismarine/protocol/bedrock/packet/CommandBlockUpdatePacket';
import type { CommandBlockTarget } from '@jsprismarine/protocol/bedrock/packet/CommandBlockUpdatePacket';

import type { BlockState } from '../../../block/state/BlockState';
import type { ServerContent } from '../../../content/ServerContent';
import type { EntityRuntime } from '../../../entity/data/EntityRuntime';
import type { LiveEntityRuntime } from '../../../entity/data/live';
import type { MinecartCommandEdit } from '../../../entity/data/minecartCommandBlock';
import { inputContext } from '../../../testing/handlerContext.test.helper';
import { STEVE } from '../../../testing/sessionIdentity.test.helper';
import { stub } from '../../../testing/stub.test.helper';
import type Chunk from '../../../world/chunk/Chunk';
import { Dimensions } from '../../../world/DimensionType';
import type { Level } from '../../../world/Level';
import type { World } from '../../../world/World';
import type PlayerSession from '../../../player/PlayerSession';
import type { InputContext } from '../../../player/context/HandlerContext';
import CommandBlockUpdateDecoder from './CommandBlockUpdateDecoder';
import { viewOf } from './DecodeView';

/** A packet decoded and its intents run, as the dispatcher wraps a decoder. */
const run = (packet: CommandBlockUpdatePacket, context: InputContext): void => {
    for (const intent of new CommandBlockUpdateDecoder().decode(packet, viewOf(context.session, context.log)))
        context.services.intents.handle(intent, context);
};

const AT = { x: 1, y: 2, z: 3 };

/** An operator in creative unless told otherwise, beside a command block, with a voxel world behind the content. */
const fixture = (options: { op?: boolean; gamemode?: Gametype } = {}) => {
    const logged: string[] = [];
    const voxels = createVoxelWorld();
    voxels.overworld.set(AT, 'minecraft:command_block', { facing_direction: 5, conditional_bit: false });
    const carts: { id: number; edit: MinecartCommandEdit }[] = [];
    const world = stub<World>({
        getLoadedChunk: () => stub<Chunk>({ getBlock: () => stub<BlockState>({ name: 'minecraft:command_block' }) }),
        getDimension: () => Dimensions.Overworld,
        getLevel: () => stub<Level>({ name: 'world' }),
        dataEntities: () =>
            stub<LiveEntityRuntime>({
                runtime: stub<EntityRuntime>({
                    setMinecartCommand: (id, edit) => {
                        carts.push({ id, edit });
                        return id === 9;
                    }
                })
            })
    });
    const session = stub<PlayerSession>({
        identity: STEVE,
        isOp: () => options.op ?? true,
        gamemode: options.gamemode ?? Gametype.CREATIVE,
        getWorld: () => world,
        getViewPosition: () => new Vector3(1, 3, 1)
    });
    const { context } = inputContext(session, {
        log: stub<Logger>({ verbose: (message) => void logged.push(message) }),
        services: {
            content: stub<ServerContent>({
                world: stub<ServerContent['world']>({
                    blockWorld: { at: (dimension) => voxels.at(dimension), updateShape: () => {} }
                })
            })
        }
    });
    return { context, logged, voxels, carts };
};

const update = (
    target: CommandBlockTarget,
    command = 'say hi',
    { tickDelay = 0, executeOnFirstTick = true }: { tickDelay?: number; executeOnFirstTick?: boolean } = {}
) =>
    new CommandBlockUpdatePacket({
        target,
        command,
        lastOutput: '',
        name: 'Herald',
        filteredName: '',
        trackOutput: true,
        tickDelay,
        executeOnFirstTick,
        lastOutputIsRawMessage: false
    });

const blockTarget = (mode = CommandBlockMode.Normal, redstoneMode = true): CommandBlockTarget => ({
    isBlock: true,
    blockPosition: new BlockPos(AT.x, AT.y, AT.z),
    commandBlockMode: mode,
    redstoneMode,
    isConditional: false
});

describe('a Bedrock command block edit', () => {
    it('stores the command and mode a player set on a command block', () => {
        const { context, voxels } = fixture();

        run(update(blockTarget(CommandBlockMode.Repeating)), context);

        expect(voxels.overworld.identifierAt(AT)).toBe('minecraft:repeating_command_block');
        expect(commandBlockStateOf(voxels.overworld.getBlockData(AT))).toMatchObject({
            command: 'say hi',
            customName: 'Herald',
            auto: false
        });
    });

    it('starts a block set to always active', () => {
        const { context, voxels } = fixture();

        run(update(blockTarget(CommandBlockMode.Normal, false)), context);

        expect(voxels.overworld.scheduled).toEqual([{ position: AT, delay: 1 }]);
    });

    it('drops an edit from a player who is not an operator in creative mode', () => {
        for (const options of [{ op: false }, { gamemode: Gametype.SURVIVAL }]) {
            const { context, voxels, logged } = fixture(options);

            run(update(blockTarget()), context);

            expect(voxels.overworld.getBlockData(AT)).toBeUndefined();
            expect(logged).toEqual([
                'Dropped a command block edit from Steve: only an operator in creative mode may make one'
            ]);
        }
    });

    it('hands a minecart’s command to the entity runtime', () => {
        const { context, carts, logged } = fixture();

        run(update({ isBlock: false, targetRuntimeId: 9n }, 'tp @p 0 64 0'), context);
        run(update({ isBlock: false, targetRuntimeId: 4n }), context);

        expect(carts.map((cart) => cart.id)).toEqual([9, 4]);
        expect(carts[0]?.edit).toEqual({ command: 'tp @p 0 64 0', customName: 'Herald', trackOutput: true });
        expect(logged).toEqual(['Dropped a command block edit from Steve: 4 is no command block minecart']);
    });

    it('keeps the name, the tick delay and the first-tick setting an edit leaves out, as a Java one does', () => {
        const { context, voxels } = fixture();
        // Neither the block's defaults, a delay of 0 and running on the first tick, so the edit
        // below can only leave them by keeping what this one set.
        run(update(blockTarget(), 'say hi', { tickDelay: 5, executeOnFirstTick: false }), context);

        context.services.intents.handle(
            {
                kind: 'editCommandBlock',
                position: AT,
                mode: 'chain',
                conditional: false,
                needsRedstone: true,
                command: 'say again',
                trackOutput: false
            },
            context
        );

        expect(voxels.overworld.identifierAt(AT)).toBe('minecraft:chain_command_block');
        expect(commandBlockStateOf(voxels.overworld.getBlockData(AT))).toMatchObject({
            command: 'say again',
            customName: 'Herald',
            tickDelay: 5,
            executeOnFirstTick: false
        });
    });
});
