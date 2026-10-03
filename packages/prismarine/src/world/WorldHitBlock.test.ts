import { LevelEvent, LevelSoundEvent } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { BlockState } from '../block/state/BlockState';
import { World } from './World';

/**
 * The sound of digging.
 *
 * Mining sent `START_BLOCK_CRACKING` and nothing else, and that is the progress overlay: it
 * draws the cracks spreading across the block and makes no sound. Breaking something was
 * silent right up until it gave way.
 */
const fakeWorld = (state: BlockState) => {
    const sounds: Array<{ sound: LevelSoundEvent; data: number }> = [];
    const effects: Array<{ event: LevelEvent; data: number }> = [];

    const world: World = Object.assign(Object.create(World.prototype), {
        getBlockState: async () => state,
        changes: {
            blockSound: (_position: Vector3, sound: LevelSoundEvent, data: number) => sounds.push({ sound, data }),
            worldEffect: (_position: Vector3 | null, event: LevelEvent, data: number) => effects.push({ event, data })
        }
    });

    return { world, sounds, effects };
};

describe('world', () => {
    describe('hitBlock', () => {
        it('sounds the hit, and sounds it like the block it struck', async () => {
            // A log lying on its side, so the id is demonstrably the state that is there and
            // not the block's default one. That id is what the client reads the material from.
            const log = new BlockState('minecraft:oak_log', { pillar_axis: 'x' });
            const { world, sounds } = fakeWorld(log);

            await world.hitBlock(new Vector3(10, 64, -20), 1);

            expect(sounds).toHaveLength(1);
            expect(sounds[0]!.sound).toBe(LevelSoundEvent.HIT);
            expect(sounds[0]!.data).toBe(BlockRuntimeIds.get(log));
            expect(sounds[0]!.data).not.toBe(BlockRuntimeIds.getByName('minecraft:oak_log'));
        });

        it('chips the side that was struck', async () => {
            const { world, effects } = fakeWorld(new BlockState('minecraft:stone'));

            for (const face of [0, 1, 2, 3, 4, 5]) await world.hitBlock(new Vector3(10, 64, -20), face);

            expect(effects.map((effect) => effect.event)).toEqual([
                LevelEvent.PARTICLES_CRACK_BLOCK_DOWN,
                LevelEvent.PARTICLES_CRACK_BLOCK_UP,
                LevelEvent.PARTICLES_CRACK_BLOCK_NORTH,
                LevelEvent.PARTICLES_CRACK_BLOCK_SOUTH,
                LevelEvent.PARTICLES_CRACK_BLOCK_WEST,
                LevelEvent.PARTICLES_CRACK_BLOCK_EAST
            ]);
        });

        it('says nothing for a face that is not one of the six', async () => {
            const { world, sounds, effects } = fakeWorld(new BlockState('minecraft:stone'));

            await world.hitBlock(new Vector3(10, 64, -20), 99);

            // The hit still lands - the swing happened - but there is no side to chip.
            expect(sounds).toHaveLength(1);
            expect(effects).toHaveLength(0);
        });

        it('is silent for air, which is what a swing at nothing hits', async () => {
            const { world, sounds, effects } = fakeWorld(new BlockState('minecraft:air'));

            await world.hitBlock(new Vector3(10, 64, -20), 1);

            expect(sounds).toHaveLength(0);
            expect(effects).toHaveLength(0);
        });
    });
});
