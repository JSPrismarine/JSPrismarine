import { describe, expect, it } from 'vitest';

import { bindFamily, heldItem, silkTouchTool } from '../harness';
import { AIR } from '../identifiers';
import { MAX_CROP_GROWTH } from '../rules/growth';
import {
    bambooFamily,
    climbingFamily,
    cropFamily,
    dripleafFamily,
    eggFamily,
    floraFamily,
    leavesFamily,
    saplingFamily,
    TREE_TRUNK_HEIGHT
} from './plants';

const ground = { x: 0, y: 0, z: 0 };
const plant = { x: 0, y: 1, z: 0 };

describe('cropFamily', () => {
    it('grows a stage per random tick that the chance comes up on', () => {
        const harness = bindFamily(cropFamily, 'minecraft:wheat');
        harness.dimension.set(ground, 'minecraft:farmland', { moisturized_amount: 7 });
        harness.dimension.set(plant, 'minecraft:wheat', { growth: 0 });
        harness.dimension.queueRandom(0.1, 0.1, 0.9, 0.1);

        harness.randomTicks(plant, 4);

        expect(harness.dimension.stateAt(plant, 'growth')).toBe(3);
    });

    it('stops at the last stage', () => {
        const harness = bindFamily(cropFamily, 'minecraft:carrots');
        harness.dimension.set(ground, 'minecraft:farmland', { moisturized_amount: 7 });
        harness.dimension.set(plant, 'minecraft:carrots', { growth: MAX_CROP_GROWTH });
        harness.dimension.queueRandom(0.01);

        harness.randomTick(plant);

        expect(harness.dimension.stateAt(plant, 'growth')).toBe(MAX_CROP_GROWTH);
    });

    it('does not grow off farmland', () => {
        const harness = bindFamily(cropFamily, 'minecraft:wheat');
        harness.dimension.set(ground, 'minecraft:dirt');
        harness.dimension.set(plant, 'minecraft:wheat', { growth: 0 });
        harness.dimension.queueRandom(0.01);

        harness.randomTick(plant);

        expect(harness.dimension.stateAt(plant, 'growth')).toBe(0);
    });

    it('pops when the farmland under it goes', () => {
        const harness = bindFamily(cropFamily, 'minecraft:wheat');
        harness.dimension.set(ground, 'minecraft:dirt');
        harness.dimension.set(plant, 'minecraft:wheat', { growth: 3 });

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe(AIR);
        expect(harness.dimension.drops.map((entry) => entry.drop.identifier)).toEqual(['minecraft:wheat']);
    });

    it('harvests a ripe berry bush back to its first stage', () => {
        const harness = bindFamily(cropFamily, 'minecraft:sweet_berry_bush');
        harness.dimension.set(plant, 'minecraft:sweet_berry_bush', { growth: 3 });

        expect(harness.interact(plant)).toBe(true);
        expect(harness.dimension.drops.map((entry) => entry.drop)).toEqual([
            { identifier: 'minecraft:sweet_berries', count: 3 }
        ]);
        expect(harness.dimension.stateAt(plant, 'growth')).toBe(1);
    });
});

describe('saplingFamily', () => {
    it('ages once and then grows a tree', () => {
        const harness = bindFamily(saplingFamily, 'minecraft:oak_sapling');
        harness.dimension.set(ground, 'minecraft:dirt');
        harness.dimension.set(plant, 'minecraft:oak_sapling', { age_bit: false });

        harness.randomTick(plant);

        expect(harness.dimension.stateAt(plant, 'age_bit')).toBe(true);
        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:oak_sapling');

        harness.dimension.queueRandom(0.01);
        harness.randomTick(plant);

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:oak_log');
        expect(harness.dimension.identifierAt({ x: 0, y: TREE_TRUNK_HEIGHT, z: 0 })).toBe('minecraft:oak_log');
        expect(harness.dimension.identifierAt({ x: 1, y: TREE_TRUNK_HEIGHT, z: 1 })).toBe('minecraft:oak_leaves');
    });

    it('does not grow in the dark', () => {
        const harness = bindFamily(saplingFamily, 'minecraft:oak_sapling');
        harness.dimension.set(ground, 'minecraft:dirt');
        harness.dimension.set(plant, 'minecraft:oak_sapling', { age_bit: true });
        harness.dimension.setLight({ x: 0, y: 2, z: 0 }, 4);

        harness.randomTick(plant);

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:oak_sapling');
    });

    it('pops off a block that is not soil', () => {
        const harness = bindFamily(saplingFamily, 'minecraft:oak_sapling');
        harness.dimension.set(ground, 'minecraft:stone');
        harness.dimension.set(plant, 'minecraft:oak_sapling', { age_bit: false });

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe(AIR);
    });
});

describe('leavesFamily', () => {
    it('keeps leaves within four blocks of a log and decays the fifth', () => {
        const harness = bindFamily(leavesFamily, 'minecraft:oak_leaves');
        harness.dimension.fill({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, 'minecraft:oak_leaves', {
            persistent_bit: false,
            update_bit: false
        });
        harness.dimension.set({ x: 5, y: 0, z: 0 }, 'minecraft:oak_log');

        harness.dimension.queueRandom(0.9);
        harness.randomTick({ x: 1, y: 0, z: 0 });

        expect(harness.dimension.identifierAt({ x: 1, y: 0, z: 0 })).toBe('minecraft:oak_leaves');

        harness.dimension.queueRandom(0.9);
        harness.randomTick({ x: 0, y: 0, z: 0 });

        expect(harness.dimension.identifierAt({ x: 0, y: 0, z: 0 })).toBe(AIR);
    });

    it('never decays a placed leaf block', () => {
        const harness = bindFamily(leavesFamily, 'minecraft:oak_leaves');
        harness.dimension.set(plant, 'minecraft:oak_leaves', { persistent_bit: true, update_bit: false });

        harness.randomTick(plant);

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:oak_leaves');
    });

    it('drops a sapling when the chance comes up', () => {
        const harness = bindFamily(leavesFamily, 'minecraft:birch_leaves');
        harness.dimension.set(plant, 'minecraft:birch_leaves', { persistent_bit: false, update_bit: false });
        harness.dimension.queueRandom(0.01);

        harness.randomTick(plant);

        expect(harness.dimension.drops.map((entry) => entry.drop.identifier)).toEqual(['minecraft:birch_sapling']);
    });

    it('comes away whole to shears or silk touch and shreds otherwise', () => {
        const harness = bindFamily(leavesFamily, 'minecraft:oak_leaves');
        harness.dimension.set(plant, 'minecraft:oak_leaves', { persistent_bit: true, update_bit: false });

        harness.breakBlock(plant, { itemStack: heldItem('minecraft:shears') });

        expect(harness.dimension.drops.map((entry) => entry.drop)).toEqual([
            { identifier: 'minecraft:oak_leaves', count: 1 }
        ]);

        harness.dimension.set(plant, 'minecraft:oak_leaves', { persistent_bit: true, update_bit: false });
        harness.breakBlock(plant, { itemStack: silkTouchTool('minecraft:iron_hoe') });

        expect(harness.dimension.drops).toHaveLength(2);

        harness.dimension.set(plant, 'minecraft:oak_leaves', { persistent_bit: true, update_bit: false });
        harness.breakBlock(plant);

        expect(harness.dimension.drops).toHaveLength(2);
        expect(harness.dimension.particles.at(-1)?.name).toBe('minecraft:leaf_particle');
    });

    it('schedules the distance check once when a neighbor changes', () => {
        const harness = bindFamily(leavesFamily, 'minecraft:oak_leaves');
        harness.dimension.set(plant, 'minecraft:oak_leaves', { persistent_bit: false, update_bit: false });

        harness.neighborChanged(plant, 'north');

        expect(harness.dimension.stateAt(plant, 'update_bit')).toBe(true);
        expect(harness.dimension.scheduled).toHaveLength(1);

        harness.neighborChanged(plant, 'south');

        expect(harness.dimension.scheduled).toHaveLength(1);
    });
});

describe('floraFamily', () => {
    it('pops off stone and stays on dirt', () => {
        const harness = bindFamily(floraFamily, 'minecraft:poppy');
        harness.dimension.set(ground, 'minecraft:dirt');
        harness.dimension.set(plant, 'minecraft:poppy');

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:poppy');

        harness.dimension.set(ground, 'minecraft:stone');
        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe(AIR);
    });

    it('takes the upper half of a tall plant with the lower one', () => {
        const harness = bindFamily(floraFamily, 'minecraft:tall_grass');
        harness.dimension.set(ground, 'minecraft:dirt');
        harness.dimension.set(plant, 'minecraft:tall_grass', { upper_block_bit: true });

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe(AIR);
    });
});

describe('bambooFamily', () => {
    it('grows a stalk up to its limit', () => {
        const harness = bindFamily(bambooFamily, 'minecraft:reeds');
        harness.dimension.set(ground, 'minecraft:sand');
        harness.dimension.set(plant, 'minecraft:reeds', { age: 0 });
        harness.dimension.queueRandom(0.01);

        harness.randomTick(plant);

        expect(harness.dimension.identifierAt({ x: 0, y: 2, z: 0 })).toBe('minecraft:reeds');
    });

    it('takes every block above it when it breaks', () => {
        const harness = bindFamily(bambooFamily, 'minecraft:bamboo');
        harness.dimension.fill({ x: 0, y: 1, z: 0 }, { x: 0, y: 4, z: 0 }, 'minecraft:bamboo', { age_bit: false });

        harness.breakBlock(plant);

        expect(harness.dimension.identifierAt({ x: 0, y: 4, z: 0 })).toBe(AIR);
        expect(harness.dimension.drops).toHaveLength(4);
    });
});

describe('climbingFamily', () => {
    it('gives scaffolding a stability distance from the supported block', () => {
        const harness = bindFamily(climbingFamily, 'minecraft:scaffolding');
        harness.dimension.set(ground, 'minecraft:stone');
        harness.dimension.set(plant, 'minecraft:scaffolding', { stability: 7, stability_check: true });
        harness.dimension.set({ x: 1, y: 1, z: 0 }, 'minecraft:scaffolding', { stability: 7, stability_check: true });

        harness.place(plant);

        expect(harness.dimension.stateAt(plant, 'stability')).toBe(0);

        harness.neighborChanged({ x: 1, y: 1, z: 0 }, 'west');

        expect(harness.dimension.stateAt({ x: 1, y: 1, z: 0 }, 'stability')).toBe(1);
    });

    it('holds a vine back from a bare hand and gives it up to shears', () => {
        const harness = bindFamily(climbingFamily, 'minecraft:vine');
        harness.dimension.set(plant, 'minecraft:vine', { vine_direction_bits: 1 });

        harness.breakBlock(plant);

        expect(harness.dimension.drops).toEqual([]);

        harness.dimension.set(plant, 'minecraft:vine', { vine_direction_bits: 1 });
        harness.breakBlock(plant, { itemStack: heldItem('minecraft:shears') });

        expect(harness.dimension.drops.map((entry) => entry.drop)).toEqual([
            { identifier: 'minecraft:vine', count: 1 }
        ]);
    });

    it('drops a ladder to a bare hand, because only the vines need cutting', () => {
        const harness = bindFamily(climbingFamily, 'minecraft:ladder');
        harness.dimension.set(plant, 'minecraft:ladder', { facing_direction: 3 });

        harness.breakBlock(plant);

        expect(harness.dimension.drops.map((entry) => entry.drop.identifier)).toEqual(['minecraft:ladder']);
    });

    it('pops a ladder whose wall goes', () => {
        const harness = bindFamily(climbingFamily, 'minecraft:ladder');
        harness.dimension.set(plant, 'minecraft:ladder', { facing_direction: 3 });

        harness.neighborChanged(plant, 'north');

        expect(harness.dimension.identifierAt(plant)).toBe(AIR);
    });
});

describe('dripleafFamily', () => {
    it('tilts a stage per scheduled tick and then resets', () => {
        const harness = bindFamily(dripleafFamily, 'minecraft:big_dripleaf');
        harness.dimension.set(ground, 'minecraft:stone');
        harness.dimension.set(plant, 'minecraft:big_dripleaf', { big_dripleaf_tilt: 'none' });

        harness.stepOn(plant);

        expect(harness.dimension.stateAt(plant, 'big_dripleaf_tilt')).toBe('unstable');

        harness.tick(plant);
        harness.tick(plant);

        expect(harness.dimension.stateAt(plant, 'big_dripleaf_tilt')).toBe('full_tilt');

        harness.tick(plant);

        expect(harness.dimension.stateAt(plant, 'big_dripleaf_tilt')).toBe('none');
    });
});

describe('eggFamily', () => {
    it('cracks twice and then hatches a turtle', () => {
        const harness = bindFamily(eggFamily, 'minecraft:turtle_egg');
        harness.dimension.set(plant, 'minecraft:turtle_egg', {
            cracked_state: 'no_cracks',
            turtle_egg_count: 'one_egg'
        });
        harness.dimension.queueRandom(0, 0, 0);

        harness.randomTicks(plant, 3);

        expect(harness.dimension.identifierAt(plant)).toBe(AIR);
        expect(harness.dimension.entities.map((entity) => entity.identifier)).toEqual(['minecraft:turtle']);
    });

    it('breaks when something lands on it', () => {
        const harness = bindFamily(eggFamily, 'minecraft:turtle_egg');
        harness.dimension.set(plant, 'minecraft:turtle_egg', { cracked_state: 'no_cracks' });
        harness.dimension.queueRandom(0);

        harness.fallOn(plant, 2);

        expect(harness.dimension.identifierAt(plant)).toBe(AIR);
    });
});
