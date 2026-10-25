import { describe, expect, it } from 'vitest';

import { AIR } from '../identifiers';
import { createVoxelWorld } from '../voxelWorld';
import { FALL_DELAY, fallOneStep, isFallingBlock, scheduleFall } from './gravity';

describe('isFallingBlock', () => {
    it('covers the loose ground blocks, the powders, the anvils and the brushables', () => {
        for (const name of [
            'minecraft:sand',
            'minecraft:red_sand',
            'minecraft:gravel',
            'minecraft:white_concrete_powder',
            'minecraft:damaged_anvil',
            'minecraft:dragon_egg',
            'minecraft:suspicious_sand'
        ]) {
            expect(isFallingBlock(name)).toBe(true);
        }

        for (const name of ['minecraft:stone', 'minecraft:sandstone', 'minecraft:white_concrete']) {
            expect(isFallingBlock(name)).toBe(false);
        }
    });
});

describe('scheduleFall', () => {
    it('schedules only when the position below is free', () => {
        const world = createVoxelWorld().overworld;
        world.set({ x: 0, y: 5, z: 0 }, 'minecraft:sand');

        expect(scheduleFall(world, world.block({ x: 0, y: 5, z: 0 }))).toBe(true);
        expect(world.scheduled).toEqual([{ position: { x: 0, y: 5, z: 0 }, delay: FALL_DELAY }]);

        world.set({ x: 0, y: 4, z: 0 }, 'minecraft:stone');

        expect(scheduleFall(world, world.block({ x: 0, y: 5, z: 0 }))).toBe(false);
    });
});

describe('fallOneStep', () => {
    it('falls through air and lands on the first solid block', () => {
        const world = createVoxelWorld().overworld;
        world.set({ x: 0, y: 0, z: 0 }, 'minecraft:stone');
        world.set({ x: 0, y: 4, z: 0 }, 'minecraft:sand');

        const steps: string[] = [];
        for (let height = 4; height > 0; height -= 1) {
            steps.push(fallOneStep(world, world.block({ x: 0, y: height, z: 0 })));
        }

        expect(steps).toEqual(['fell', 'fell', 'fell', 'landed']);
        expect(world.identifierAt({ x: 0, y: 1, z: 0 })).toBe('minecraft:sand');
        expect(world.identifierAt({ x: 0, y: 4, z: 0 })).toBe(AIR);
    });

    it('carries the block states down with it', () => {
        const world = createVoxelWorld().overworld;
        world.set({ x: 0, y: 2, z: 0 }, 'minecraft:anvil', { 'minecraft:cardinal_direction': 'west' });

        fallOneStep(world, world.block({ x: 0, y: 2, z: 0 }));

        expect(world.stateAt({ x: 0, y: 1, z: 0 }, 'minecraft:cardinal_direction')).toBe('west');
    });

    it('destroys a block a piston would pop and drops it', () => {
        const world = createVoxelWorld().overworld;
        world.defineProperties('minecraft:torch', { pushReaction: 'popped' });
        world.set({ x: 0, y: 1, z: 0 }, 'minecraft:torch');
        world.set({ x: 0, y: 2, z: 0 }, 'minecraft:gravel');

        expect(fallOneStep(world, world.block({ x: 0, y: 2, z: 0 }))).toBe('fell');
        expect(world.drops.map((entry) => entry.drop.identifier)).toEqual(['minecraft:torch']);
        expect(world.identifierAt({ x: 0, y: 1, z: 0 })).toBe('minecraft:gravel');
    });

    it('falls into a liquid without dropping it', () => {
        const world = createVoxelWorld().overworld;
        world.set({ x: 0, y: 1, z: 0 }, 'minecraft:water');
        world.set({ x: 0, y: 2, z: 0 }, 'minecraft:red_sand');

        expect(fallOneStep(world, world.block({ x: 0, y: 2, z: 0 }))).toBe('fell');
        expect(world.drops).toEqual([]);
    });
});
