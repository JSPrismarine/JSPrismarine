import { describe, expect, it } from 'vitest';

import { AIR, createVoxelWorld, OVERWORLD } from './voxelWorld';
import { DEFAULT_BLOCK_PROPERTIES } from './world';

describe('VoxelWorld', () => {
    it('reads an unwritten position as air', () => {
        const world = createVoxelWorld().overworld;

        expect(world.block({ x: 0, y: 0, z: 0 })).toEqual({
            identifier: AIR,
            position: { x: 0, y: 0, z: 0 },
            dimension: OVERWORLD,
            states: {}
        });
    });

    it('keeps dimensions apart', () => {
        const world = createVoxelWorld();
        world.at('minecraft:nether').set({ x: 0, y: 0, z: 0 }, 'minecraft:netherrack');

        expect(world.overworld.identifierAt({ x: 0, y: 0, z: 0 })).toBe(AIR);
        expect(world.at('minecraft:nether').identifierAt({ x: 0, y: 0, z: 0 })).toBe('minecraft:netherrack');
    });

    it('fills an inclusive box', () => {
        const world = createVoxelWorld().overworld;
        world.fill({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, 'minecraft:stone');

        expect(world.identifierAt({ x: 1, y: 1, z: 1 })).toBe('minecraft:stone');
        expect(world.identifierAt({ x: 2, y: 0, z: 0 })).toBe(AIR);
    });

    it('writing air clears the position', () => {
        const world = createVoxelWorld().overworld;
        world.set({ x: 0, y: 0, z: 0 }, 'minecraft:stone');
        world.setBlock({ x: 0, y: 0, z: 0 }, AIR);

        expect(world.identifierAt({ x: 0, y: 0, z: 0 })).toBe(AIR);
    });

    it('records drops, sounds, particles, ticks and neighbor notices in order', () => {
        const world = createVoxelWorld().overworld;
        const position = { x: 2, y: 3, z: 4 };

        world.dropItem(position, { identifier: 'minecraft:wheat', count: 1 });
        world.playSound(position, 'block.crop.break');
        world.spawnParticle(position, 'minecraft:crop_growth_emitter');
        world.scheduleTick(position, 10);
        world.notifyNeighbors(position);

        expect(world.drops).toEqual([{ position, drop: { identifier: 'minecraft:wheat', count: 1 } }]);
        expect(world.sounds).toEqual([{ position, name: 'block.crop.break' }]);
        expect(world.particles).toEqual([{ position, name: 'minecraft:crop_growth_emitter' }]);
        expect(world.scheduled).toEqual([{ position, delay: 10 }]);
        expect(world.notified).toEqual([position]);
    });

    it('finds entities by the block they stand in and forgets removed ones', () => {
        const world = createVoxelWorld().overworld;
        const id = world.spawnEntity({ x: 1, y: 0, z: 1 }, 'minecraft:pig');
        world.addEntity('minecraft:cow', { x: 9, y: 0, z: 9 });

        expect(world.entitiesAt({ x: 1, y: 0, z: 1 }).map((entity) => entity.identifier)).toEqual(['minecraft:pig']);

        world.removeEntity(id);

        expect(world.entitiesAt({ x: 1, y: 0, z: 1 })).toEqual([]);
    });

    it('stores block entity data whole', () => {
        const world = createVoxelWorld().overworld;
        world.setBlockData(
            { x: 0, y: 0, z: 0 },
            { items: [{ identifier: 'minecraft:stone', count: 1 }], capacity: 27 }
        );

        expect(world.getBlockData({ x: 0, y: 0, z: 0 })?.capacity).toBe(27);
        expect(world.getBlockData({ x: 1, y: 0, z: 0 })).toBeUndefined();
    });

    it('reports the properties a test defined and the component defaults otherwise', () => {
        const world = createVoxelWorld().overworld;
        world.defineProperties('minecraft:obsidian', { pushReaction: 'immovable' });

        expect(world.propertiesOf('minecraft:obsidian').pushReaction).toBe('immovable');
        expect(world.propertiesOf('minecraft:stone')).toEqual(DEFAULT_BLOCK_PROPERTIES);
    });

    it('returns queued chance values first, then a repeatable sequence', () => {
        const world = createVoxelWorld().overworld;
        world.queueRandom(0.1, 0.9);

        expect([world.random(), world.random()]).toEqual([0.1, 0.9]);

        const rest = [world.random(), world.random()];
        const other = createVoxelWorld().overworld;

        expect([other.random(), other.random()]).toEqual(rest);
    });

    it('defaults light to full and power to none', () => {
        const world = createVoxelWorld().overworld;

        expect(world.lightLevel({ x: 0, y: 0, z: 0 })).toBe(15);
        expect(world.redstonePower({ x: 0, y: 0, z: 0 })).toBe(0);

        world.setLight({ x: 0, y: 0, z: 0 }, 3);
        world.setPower({ x: 0, y: 0, z: 0 }, 15);

        expect(world.lightLevel({ x: 0, y: 0, z: 0 })).toBe(3);
        expect(world.redstonePower({ x: 0, y: 0, z: 0 })).toBe(15);
    });
});
