import { describe, expect, it } from 'vitest';

import { createVoxelWorld } from '../voxelWorld';
import { advanceCounter, cropGrowthChance, hasNearbyLog, isLogName, MAX_CROP_GROWTH } from './growth';

const crop = { x: 0, y: 1, z: 0 };
const ground = { x: 0, y: 0, z: 0 };

describe('cropGrowthChance', () => {
    it('is higher on moist farmland than on dry', () => {
        const world = createVoxelWorld().overworld;
        world.set(ground, 'minecraft:farmland', { moisturized_amount: 7 });
        world.set(crop, 'minecraft:wheat', { growth: 0 });

        expect(cropGrowthChance(world, world.block(crop))).toBe(1 / 4);

        world.set(ground, 'minecraft:farmland', { moisturized_amount: 0 });

        expect(cropGrowthChance(world, world.block(crop))).toBe(1 / 8);
    });

    it('is zero off farmland and zero in the dark', () => {
        const world = createVoxelWorld().overworld;
        world.set(ground, 'minecraft:dirt');
        world.set(crop, 'minecraft:wheat', { growth: 0 });

        expect(cropGrowthChance(world, world.block(crop))).toBe(0);

        world.set(ground, 'minecraft:farmland', { moisturized_amount: 7 });
        world.setLight({ x: 0, y: 2, z: 0 }, 4);

        expect(cropGrowthChance(world, world.block(crop))).toBe(0);
    });
});

describe('advanceCounter', () => {
    it('moves the counter when the chance comes up and stops at the maximum', () => {
        const world = createVoxelWorld().overworld;
        world.set(crop, 'minecraft:wheat', { growth: 0 });
        world.queueRandom(0.1, 0.9);

        expect(advanceCounter(world, world.block(crop), 'growth', MAX_CROP_GROWTH, 0.5)).toBe(true);
        expect(world.stateAt(crop, 'growth')).toBe(1);

        expect(advanceCounter(world, world.block(crop), 'growth', MAX_CROP_GROWTH, 0.5)).toBe(false);
        expect(world.stateAt(crop, 'growth')).toBe(1);

        world.set(crop, 'minecraft:wheat', { growth: MAX_CROP_GROWTH });

        expect(advanceCounter(world, world.block(crop), 'growth', MAX_CROP_GROWTH, 1)).toBe(false);
    });
});

describe('isLogName', () => {
    it('matches the four log spellings', () => {
        expect(isLogName('minecraft:oak_log')).toBe(true);
        expect(isLogName('minecraft:stripped_birch_wood')).toBe(true);
        expect(isLogName('minecraft:crimson_stem')).toBe(true);
        expect(isLogName('minecraft:warped_hyphae')).toBe(true);
        expect(isLogName('minecraft:oak_leaves')).toBe(false);
    });
});

describe('hasNearbyLog', () => {
    it('finds a log through a chain of leaves within four blocks', () => {
        const world = createVoxelWorld().overworld;
        world.fill({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, 'minecraft:oak_leaves');
        world.set({ x: 4, y: 0, z: 0 }, 'minecraft:oak_log');

        expect(hasNearbyLog(world, world.block({ x: 0, y: 0, z: 0 }))).toBe(true);
    });

    it('does not find one a fifth block away', () => {
        const world = createVoxelWorld().overworld;
        world.fill({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, 'minecraft:oak_leaves');
        world.set({ x: 5, y: 0, z: 0 }, 'minecraft:oak_log');

        expect(hasNearbyLog(world, world.block({ x: 0, y: 0, z: 0 }))).toBe(false);
    });

    it('does not walk through anything but leaves', () => {
        const world = createVoxelWorld().overworld;
        world.set({ x: 0, y: 0, z: 0 }, 'minecraft:oak_leaves');
        world.set({ x: 1, y: 0, z: 0 }, 'minecraft:stone');
        world.set({ x: 2, y: 0, z: 0 }, 'minecraft:oak_log');

        expect(hasNearbyLog(world, world.block({ x: 0, y: 0, z: 0 }))).toBe(false);
    });
});
