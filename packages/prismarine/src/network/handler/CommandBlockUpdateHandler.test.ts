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

import type { BlockState } from '../../block/state/BlockState';
import type { ServerContent } from '../../content/ServerContent';
import type { EntityRuntime } from '../../entity/data/EntityRuntime';
import type { LiveEntityRuntime } from '../../entity/data/live';
import type { MinecartCommandEdit } from '../../entity/data/minecartCommandBlock';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type Chunk from '../../world/chunk/Chunk';
import { Dimensions } from '../../world/DimensionType';
import type { Level } from '../../world/Level';
import type { World } from '../../world/World';
import type PlayerSession from '../PlayerSession';
import CommandBlockUpdateHandler from './CommandBlockUpdateHandler';

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

const update = (target: CommandBlockTarget, command = 'say hi') =>
    new CommandBlockUpdatePacket({
        target,
        command,
        lastOutput: '',
        name: 'Herald',
        filteredName: '',
        trackOutput: true,
        tickDelay: 0,
        executeOnFirstTick: true,
        lastOutputIsRawMessage: false
    });

const blockTarget = (mode = CommandBlockMode.Normal, redstoneMode = true): CommandBlockTarget => ({
    isBlock: true,
    blockPosition: new BlockPos(AT.x, AT.y, AT.z),
    commandBlockMode: mode,
    redstoneMode,
    isConditional: false
});

describe('CommandBlockUpdateHandler', () => {
    it('stores the command and mode a player set on a command block', () => {
        const { context, voxels } = fixture();

        new CommandBlockUpdateHandler().handle(update(blockTarget(CommandBlockMode.Repeating)), context);

        expect(voxels.overworld.identifierAt(AT)).toBe('minecraft:repeating_command_block');
        expect(commandBlockStateOf(voxels.overworld.getBlockData(AT))).toMatchObject({
            command: 'say hi',
            customName: 'Herald',
            auto: false
        });
    });

    it('starts a block set to always active', () => {
        const { context, voxels } = fixture();

        new CommandBlockUpdateHandler().handle(update(blockTarget(CommandBlockMode.Normal, false)), context);

        expect(voxels.overworld.scheduled).toEqual([{ position: AT, delay: 1 }]);
    });

    it('drops an edit from a player who is not an operator in creative mode', () => {
        for (const options of [{ op: false }, { gamemode: Gametype.SURVIVAL }]) {
            const { context, voxels, logged } = fixture(options);

            new CommandBlockUpdateHandler().handle(update(blockTarget()), context);

            expect(voxels.overworld.getBlockData(AT)).toBeUndefined();
            expect(logged).toEqual([
                'Dropped a command block edit from Steve: only an operator in creative mode may make one'
            ]);
        }
    });

    it('hands a minecart’s command to the entity runtime', () => {
        const { context, carts, logged } = fixture();

        new CommandBlockUpdateHandler().handle(
            update({ isBlock: false, targetRuntimeId: 9n }, 'tp @p 0 64 0'),
            context
        );
        new CommandBlockUpdateHandler().handle(update({ isBlock: false, targetRuntimeId: 4n }), context);

        expect(carts.map((cart) => cart.id)).toEqual([9, 4]);
        expect(carts[0]?.edit).toEqual({ command: 'tp @p 0 64 0', customName: 'Herald', trackOutput: true });
        expect(logged).toEqual(['Dropped a command block edit from Steve: 4 is no command block minecart']);
    });
});
