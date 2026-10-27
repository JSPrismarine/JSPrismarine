import { LevelEvent } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import type { Block } from '../block/Block';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { BlockState } from '../block/state/BlockState';
import { Item } from '../item/Item';
import { stub } from '../testing/stub.test.helper';
import { World } from './World';

/**
 * Mining with server-authoritative block breaking, as BDS 1.26.52 animates it: the cracks
 * start once and then move on every tick, each tick with particles off the face being mined.
 *
 * The block takes `breakSeconds` with a pickaxe and five times as long with anything else, so a
 * test can tell which tool the break time was read for. `state` is what stands at the mined
 * block now, and a test changes it to stand in for someone else changing the block.
 */
const fakeWorld = (initial: BlockState, breakSeconds: number) => {
    const effects: Array<{ position: Vector3 | null; event: LevelEvent; data: number }> = [];
    const at = { state: initial };

    const world: World = Object.assign(Object.create(World.prototype), {
        getBlockState: async () => at.state,
        loadedBlockRuntimeIdAt: () => BlockRuntimeIds.get(at.state),
        getBlock: async () =>
            stub<Block>({
                getBreakTime: (tool) => (tool?.getName() === 'minecraft:iron_pickaxe' ? breakSeconds : breakSeconds * 5)
            }),
        changes: {
            worldEffect: (position: Vector3 | null, event: LevelEvent, data: number) =>
                effects.push({ position, event, data })
        }
    });

    return { world, effects, at };
};

const STONE = new BlockState('minecraft:stone');
const BLOCK = new Vector3(2, 57, 16);
const PICKAXE = new Item({ name: 'minecraft:iron_pickaxe' });

describe('world', () => {
    describe('block cracking', () => {
        it('starts the cracks with the progress one tick is worth for the tool in hand', async () => {
            // 0.6 seconds is twelve ticks, so a tick is worth 65535 / 12 of a break.
            const { world, effects } = fakeWorld(STONE, 0.6);

            const mining = await world.startBlockCracking(BLOCK, 5, PICKAXE, null);

            expect(mining).toEqual({
                position: BLOCK,
                face: 5,
                runtimeId: BlockRuntimeIds.get(STONE),
                progressPerTick: 5461
            });
            expect(effects).toEqual([{ position: BLOCK, event: LevelEvent.START_BLOCK_CRACKING, data: 5461 }]);
        });

        it('cracks at a bare hand pace with nothing in hand', async () => {
            // Three seconds, sixty ticks.
            const { world } = fakeWorld(STONE, 0.6);

            const mining = await world.startBlockCracking(BLOCK, 5, null, null);

            expect(mining?.progressPerTick).toBe(Math.floor(65535 / 60));
        });

        it('stops the cracks on the block mined before, first', async () => {
            const { world, effects } = fakeWorld(STONE, 0.6);
            const previous = await world.startBlockCracking(new Vector3(2, 56, 16), 5, PICKAXE, null);
            effects.length = 0;

            await world.startBlockCracking(BLOCK, 5, PICKAXE, previous);

            expect(effects.map(({ event, position }) => [event, position])).toEqual([
                [LevelEvent.STOP_BLOCK_CRACKING, new Vector3(2, 56, 16)],
                [LevelEvent.START_BLOCK_CRACKING, BLOCK]
            ]);
        });

        it('sends particles off the face being mined from the center, then the progress, each tick', async () => {
            const { world, effects } = fakeWorld(STONE, 0.6);
            const mining = await world.startBlockCracking(BLOCK, 5, PICKAXE, null);
            effects.length = 0;

            expect(await world.updateBlockCracking(mining!)).toBe(true);

            expect(effects).toEqual([
                {
                    position: new Vector3(2.5, 57.5, 16.5),
                    event: LevelEvent.PARTICLES_CRACK_BLOCK_EAST,
                    data: BlockRuntimeIds.get(STONE)
                },
                { position: BLOCK, event: LevelEvent.UPDATE_BLOCK_CRACKING, data: 5461 }
            ]);
        });

        it('stops the cracks once the block is no longer the one being mined', async () => {
            // Someone else broke it. The cracks belonged to the stone, and nothing goes out for
            // the air that replaced it but the stop.
            const { world, effects, at } = fakeWorld(STONE, 0.6);
            const mining = await world.startBlockCracking(BLOCK, 5, PICKAXE, null);
            effects.length = 0;
            at.state = new BlockState('minecraft:air');

            expect(await world.updateBlockCracking(mining!)).toBe(false);

            expect(effects).toEqual([{ position: BLOCK, event: LevelEvent.STOP_BLOCK_CRACKING, data: 0 }]);
        });

        it('animates nothing for a block that breaks at once', async () => {
            const { world, effects } = fakeWorld(new BlockState('minecraft:short_grass'), 0);

            expect(await world.startBlockCracking(BLOCK, 1, PICKAXE, null)).toBeNull();
            expect(effects).toEqual([]);
        });

        it('animates nothing for air', async () => {
            const { world, effects } = fakeWorld(new BlockState('minecraft:air'), 0.6);

            expect(await world.startBlockCracking(BLOCK, 1, PICKAXE, null)).toBeNull();
            expect(effects).toEqual([]);
        });

        it('stops the cracks where it is told', async () => {
            const { world, effects } = fakeWorld(STONE, 0.6);

            await world.stopBlockCracking(BLOCK);

            expect(effects).toEqual([{ position: BLOCK, event: LevelEvent.STOP_BLOCK_CRACKING, data: 0 }]);
        });
    });
});
