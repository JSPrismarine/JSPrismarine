import { describe, expect, it } from 'vitest';

import type { BlockPosition, HookBlock } from '@jsprismarine/blocks';

import { bindFamily, heldItem, silkTouchTool } from '../harness';
import { AIR } from '../identifiers';
import { MAX_CROP_GROWTH } from '../rules/growth';
import { OVERWORLD, VoxelDimension, VoxelWorld } from '../voxelWorld';
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

class BambooSupportDimension extends VoxelDimension {
    public hasBlockTag(block: HookBlock, tag: string): boolean {
        return tag === 'minecraft:supports_bamboo' && block.identifier === 'minecraft:gravel';
    }
}

class BambooSupportWorld extends VoxelWorld {
    private readonly bambooDimension = new BambooSupportDimension(OVERWORLD);

    public override at(dimension = OVERWORLD): BambooSupportDimension {
        if (dimension !== OVERWORLD) throw new Error(`Unexpected test dimension: ${dimension}`);
        return this.bambooDimension;
    }
}

class VegetationSupportDimension extends VoxelDimension {
    public hasBlockTag(block: HookBlock, tag: string): boolean {
        return (
            (tag === 'minecraft:supports_dry_vegetation' && block.identifier === 'minecraft:sand') ||
            (tag === 'minecraft:supports_vegetation' && block.identifier === 'minecraft:dirt') ||
            (tag === 'minecraft:supports_cactus' && block.identifier === 'minecraft:sand') ||
            (tag === 'minecraft:supports_sugar_cane' && block.identifier === 'minecraft:sand') ||
            (tag === 'minecraft:supports_lily_pad' && block.identifier === 'minecraft:water') ||
            (tag === 'minecraft:supports_azalea' && block.identifier === 'minecraft:rooted_dirt') ||
            (tag === 'minecraft:supports_mangrove_propagule' &&
                block.identifier === 'minecraft:muddy_mangrove_roots') ||
            (tag === 'minecraft:supports_wither_rose' && block.identifier === 'minecraft:netherrack')
        );
    }
}

class VegetationSupportWorld extends VoxelWorld {
    private readonly vegetationDimension = new VegetationSupportDimension(OVERWORLD);

    public override at(dimension = OVERWORLD): VegetationSupportDimension {
        if (dimension !== OVERWORLD) throw new Error(`Unexpected test dimension: ${dimension}`);
        return this.vegetationDimension;
    }
}

class MissingGroundDimension extends VoxelDimension {
    public override getBlock(position: BlockPosition): HookBlock | undefined {
        if (position.x === ground.x && position.y === ground.y && position.z === ground.z) return undefined;
        return super.getBlock(position);
    }
}

class MissingGroundWorld extends VoxelWorld {
    private readonly missingGroundDimension = new MissingGroundDimension(OVERWORLD);

    public override at(dimension = OVERWORLD): MissingGroundDimension {
        if (dimension !== OVERWORLD) throw new Error(`Unexpected test dimension: ${dimension}`);
        return this.missingGroundDimension;
    }
}

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

    it('keeps a crop when an unrelated side block changes', () => {
        const harness = bindFamily(cropFamily, 'minecraft:wheat');
        harness.dimension.set(ground, 'minecraft:stone');
        harness.dimension.set(plant, 'minecraft:wheat', { growth: 3 });

        harness.neighborChanged(plant, 'north');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:wheat');
    });

    it('ignores side changes to cave vines and keeps them joined to the vine above', () => {
        const harness = bindFamily(cropFamily, 'minecraft:cave_vines');
        harness.dimension.set(plant, 'minecraft:cave_vines', { growing_plant_age: 0 });
        harness.dimension.set({ x: 0, y: 2, z: 0 }, 'minecraft:cave_vines_body_with_berries');

        harness.neighborChanged(plant, 'west');
        harness.neighborChanged(plant, 'up');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:cave_vines');
    });

    it('does not pop cocoa when its neighbor changes below', () => {
        const harness = bindFamily(cropFamily, 'minecraft:cocoa');
        harness.dimension.set(ground, 'minecraft:stone');
        harness.dimension.set(plant, 'minecraft:cocoa', { age: 0, facing_direction: 2 });

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:cocoa');
    });

    it('ignores the rooted lower face of an upper pitcher plant', () => {
        const harness = bindFamily(cropFamily, 'minecraft:pitcher_plant');
        harness.dimension.set(ground, 'minecraft:stone');
        harness.dimension.set(plant, 'minecraft:pitcher_plant', { upper_block_bit: true });

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:pitcher_plant');
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

    it('keeps a berry bush on tagged vegetation support when its ground updates', () => {
        const harness = bindFamily(cropFamily, 'minecraft:sweet_berry_bush', { world: new VegetationSupportWorld() });
        harness.dimension.set(ground, 'minecraft:dirt');
        harness.dimension.set(plant, 'minecraft:sweet_berry_bush', { growth: 1 });

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:sweet_berry_bush');
        expect(harness.dimension.drops).toEqual([]);
    });

    it('pops a berry bush when its support tag rejects the ground', () => {
        const harness = bindFamily(cropFamily, 'minecraft:sweet_berry_bush', { world: new VegetationSupportWorld() });
        harness.dimension.set(ground, 'minecraft:stone');
        harness.dimension.set(plant, 'minecraft:sweet_berry_bush', { growth: 1 });

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe(AIR);
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

    it('keeps a sapling when an unrelated side block changes', () => {
        const harness = bindFamily(saplingFamily, 'minecraft:oak_sapling');
        harness.dimension.set(ground, 'minecraft:stone');
        harness.dimension.set(plant, 'minecraft:oak_sapling', { age_bit: false });

        harness.neighborChanged(plant, 'east');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:oak_sapling');
    });

    it('keeps a propagule on its tagged mangrove support when the ground updates', () => {
        const harness = bindFamily(saplingFamily, 'minecraft:mangrove_propagule', {
            world: new VegetationSupportWorld()
        });
        harness.dimension.set(ground, 'minecraft:muddy_mangrove_roots');
        harness.dimension.set(plant, 'minecraft:mangrove_propagule');

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:mangrove_propagule');
        expect(harness.dimension.drops).toEqual([]);
    });
});

describe('leavesFamily', () => {
    it('keeps leaves within six blocks of a log and decays the seventh', () => {
        const harness = bindFamily(leavesFamily, 'minecraft:oak_leaves');
        harness.dimension.fill({ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }, 'minecraft:oak_leaves', {
            persistent_bit: false,
            update_bit: false
        });
        harness.dimension.set({ x: 7, y: 0, z: 0 }, 'minecraft:oak_log');

        harness.dimension.queueRandom(0.9);
        harness.randomTick({ x: 1, y: 0, z: 0 });

        expect(harness.dimension.identifierAt({ x: 1, y: 0, z: 0 })).toBe('minecraft:oak_leaves');

        harness.dimension.queueRandom(0.9);
        harness.randomTick({ x: 0, y: 0, z: 0 });

        expect(harness.dimension.identifierAt({ x: 0, y: 0, z: 0 })).toBe(AIR);
    });

    it('drops nothing from a canopy Java built, however many random ticks it gets', () => {
        // The reported flood: thousands of items appearing as new chunks started ticking.
        // A radius-4 rule condemned 59 of the 1173 leaves in one generated chunk where
        // Java's condemns 4, and every condemned leaf is a break with a chance of a drop.
        // This is the shape that broke, a canopy whose outer leaves are five and six steps
        // from the trunk, random-ticked until every position has had a turn.
        const harness = bindFamily(leavesFamily, 'minecraft:oak_leaves');
        const canopy: { x: number; y: number; z: number }[] = [];

        for (let y = 0; y <= 2; y += 1) {
            const reach = 3 - y;
            for (let x = -reach; x <= reach; x += 1) {
                for (let z = -reach; z <= reach; z += 1) {
                    if (x === 0 && z === 0 && y < 2) continue;
                    canopy.push({ x, y, z });
                }
            }
        }

        for (const position of canopy) {
            harness.dimension.set(position, 'minecraft:oak_leaves', { persistent_bit: false, update_bit: false });
        }
        harness.dimension.fill({ x: 0, y: -4, z: 0 }, { x: 0, y: 1, z: 0 }, 'minecraft:oak_log');

        for (const position of canopy) {
            harness.dimension.queueRandom(0);
            harness.randomTick(position);
        }

        expect(harness.dimension.drops).toEqual([]);
        expect(canopy.filter((position) => harness.dimension.identifierAt(position) === AIR)).toEqual([]);
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

    it('writes nothing when a neighbor changes', () => {
        // The decay check reads the canopy fresh on every random tick, so a neighbor
        // change has nothing to record. Writing update_bit here used to cost two block
        // writes per leaf per tick forever: clearing it notified the six neighbors, each
        // un-flagged leaf flagged itself again, and the canopy never settled. A 125-leaf
        // slab churned 248 writes a tick, each one a packet, a light update, seven
        // scheduled physics positions and six more notifications.
        const harness = bindFamily(leavesFamily, 'minecraft:oak_leaves');
        harness.dimension.set(plant, 'minecraft:oak_leaves', { persistent_bit: false, update_bit: false });

        harness.neighborChanged(plant, 'north');

        expect(harness.dimension.stateAt(plant, 'update_bit')).toBe(false);
        expect(harness.dimension.scheduled).toEqual([]);
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

    it('keeps a dead bush on sand when a nearby block changes', () => {
        const harness = bindFamily(floraFamily, 'minecraft:deadbush');
        harness.dimension.set(ground, 'minecraft:sand');
        harness.dimension.set(plant, 'minecraft:deadbush');

        harness.neighborChanged(plant, 'north');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:deadbush');
        expect(harness.dimension.drops).toEqual([]);
    });

    it('keeps a dead bush when its tagged sand support updates', () => {
        const harness = bindFamily(floraFamily, 'minecraft:deadbush', { world: new VegetationSupportWorld() });
        harness.dimension.set(ground, 'minecraft:sand');
        harness.dimension.set(plant, 'minecraft:deadbush');

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:deadbush');
        expect(harness.dimension.drops).toEqual([]);
    });

    it.each([
        ['cactus', 'sand'],
        ['sugar_cane', 'sand'],
        ['lily_pad', 'water'],
        ['azalea', 'rooted_dirt'],
        ['wither_rose', 'netherrack']
    ])('keeps %s on its tagged %s support when the ground updates', (name, support) => {
        const harness = bindFamily(floraFamily, `minecraft:${name}`, { world: new VegetationSupportWorld() });
        harness.dimension.set(ground, `minecraft:${support}`);
        harness.dimension.set(plant, `minecraft:${name}`);

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe(`minecraft:${name}`);
        expect(harness.dimension.drops).toEqual([]);
    });

    it.each([
        { name: 'deadbush', support: 'red_sand', family: floraFamily },
        { name: 'deadbush', support: 'orange_terracotta', family: floraFamily },
        { name: 'cactus', support: 'sand', family: floraFamily },
        { name: 'sugar_cane', support: 'sand', family: floraFamily },
        { name: 'lily_pad', support: 'water', family: floraFamily },
        { name: 'azalea', support: 'rooted_dirt', family: floraFamily },
        { name: 'mangrove_propagule', support: 'muddy_mangrove_roots', family: saplingFamily },
        { name: 'wither_rose', support: 'netherrack', family: floraFamily }
    ])('keeps $name on $support without a block-tag API', ({ name, support, family }) => {
        const harness = bindFamily(family, `minecraft:${name}`);
        harness.dimension.set(ground, `minecraft:${support}`);
        harness.dimension.set(plant, `minecraft:${name}`);

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe(`minecraft:${name}`);
    });

    it('pops a dead bush from glazed terracotta', () => {
        const harness = bindFamily(floraFamily, 'minecraft:deadbush');
        harness.dimension.set(ground, 'minecraft:orange_glazed_terracotta');
        harness.dimension.set(plant, 'minecraft:deadbush');

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe(AIR);
    });

    it('pops a plant when its support position cannot be read', () => {
        const harness = bindFamily(floraFamily, 'minecraft:deadbush', { world: new MissingGroundWorld() });
        harness.dimension.set(plant, 'minecraft:deadbush');

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

    it('keeps the upper half when a side neighbor changes', () => {
        const harness = bindFamily(floraFamily, 'minecraft:tall_grass');
        harness.dimension.set(ground, 'minecraft:tall_grass', { upper_block_bit: false });
        harness.dimension.set(plant, 'minecraft:tall_grass', { upper_block_bit: true });

        harness.neighborChanged(plant, 'east');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:tall_grass');
    });

    it('keeps the lower half joined to its upper half', () => {
        const harness = bindFamily(floraFamily, 'minecraft:tall_grass');
        harness.dimension.set(ground, 'minecraft:dirt');
        harness.dimension.set(plant, 'minecraft:tall_grass', { upper_block_bit: false });
        harness.dimension.set({ x: 0, y: 2, z: 0 }, 'minecraft:tall_grass', { upper_block_bit: true });

        harness.neighborChanged(plant, 'up');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:tall_grass');
    });

    it('pops the lower half when its ground loses support', () => {
        const harness = bindFamily(floraFamily, 'minecraft:tall_grass');
        harness.dimension.set(ground, 'minecraft:stone');
        harness.dimension.set(plant, 'minecraft:tall_grass', { upper_block_bit: false });
        harness.dimension.set({ x: 0, y: 2, z: 0 }, 'minecraft:tall_grass', { upper_block_bit: true });

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe(AIR);
    });

    it('pops wildflowers when their support is outside the vegetation fallback', () => {
        const harness = bindFamily(climbingFamily, 'minecraft:wildflowers');
        harness.dimension.set(ground, 'minecraft:stone');
        harness.dimension.set(plant, 'minecraft:wildflowers');

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe(AIR);
    });

    it('pops leaf litter when its supporting top face goes', () => {
        const harness = bindFamily(climbingFamily, 'minecraft:leaf_litter');
        harness.dimension.set(plant, 'minecraft:leaf_litter');

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

    it('writes the bamboo growth counter without adding an unsupported state', () => {
        const harness = bindFamily(bambooFamily, 'minecraft:bamboo');
        const states = {
            age_bit: 0,
            bamboo_leaf_size: 'large_leaves',
            bamboo_stalk_thickness: 'thick'
        };
        const above = { x: 0, y: 2, z: 0 };
        harness.dimension.set(plant, 'minecraft:bamboo', states);
        harness.dimension.queueRandom(0.01);

        harness.randomTick(plant);

        expect(harness.dimension.identifierAt(above)).toBe('minecraft:bamboo');
        expect(harness.dimension.block(above).states).toEqual(states);
        expect(harness.dimension.block(above).states.age).toBeUndefined();
    });

    it('takes every block above it when it breaks', () => {
        const harness = bindFamily(bambooFamily, 'minecraft:bamboo');
        harness.dimension.fill({ x: 0, y: 1, z: 0 }, { x: 0, y: 4, z: 0 }, 'minecraft:bamboo', { age_bit: false });

        harness.breakBlock(plant);

        expect(harness.dimension.identifierAt({ x: 0, y: 4, z: 0 })).toBe(AIR);
        expect(harness.dimension.drops).toHaveLength(4);
    });

    it('keeps a stalk rooted on gravel, which the bamboo support tag allows', () => {
        const harness = bindFamily(bambooFamily, 'minecraft:bamboo', { world: new BambooSupportWorld() });
        harness.dimension.set(ground, 'minecraft:gravel');
        harness.dimension.set(plant, 'minecraft:bamboo');

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:bamboo');
        expect(harness.dimension.drops).toEqual([]);
    });

    it('keeps soil support when the host cannot query Java block tags', () => {
        const harness = bindFamily(bambooFamily, 'minecraft:bamboo');
        harness.dimension.set(ground, 'minecraft:dirt');
        harness.dimension.set(plant, 'minecraft:bamboo');

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:bamboo');
        expect(harness.dimension.drops).toEqual([]);
    });

    it('pops a stalk whose ground is outside the bamboo support tag', () => {
        const harness = bindFamily(bambooFamily, 'minecraft:bamboo', { world: new BambooSupportWorld() });
        harness.dimension.set(ground, 'minecraft:stone');
        harness.dimension.set(plant, 'minecraft:bamboo');

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe(AIR);
        expect(harness.dimension.drops).toHaveLength(1);
    });

    it('keeps a stalk when an unrelated side block changes', () => {
        const harness = bindFamily(bambooFamily, 'minecraft:bamboo');
        harness.dimension.set(ground, 'minecraft:stone');
        harness.dimension.set(plant, 'minecraft:bamboo');

        harness.neighborChanged(plant, 'north');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:bamboo');
    });

    it('only schedules coral when its upper neighbor changes', () => {
        const harness = bindFamily(bambooFamily, 'minecraft:brain_coral');
        harness.dimension.set(plant, 'minecraft:brain_coral');

        harness.neighborChanged(plant, 'west');
        expect(harness.dimension.scheduled).toEqual([]);

        harness.neighborChanged(plant, 'up');
        expect(harness.dimension.scheduled.map((tick) => tick.position)).toEqual([plant]);
    });
});

describe('climbingFamily', () => {
    it('keeps a vine attached to a tree when a nearby block changes', () => {
        const harness = bindFamily(climbingFamily, 'minecraft:vine');
        const tree = { x: 1, y: 1, z: 0 };
        harness.dimension.set(plant, 'minecraft:vine', { vine_direction_bits: 8 });
        harness.dimension.set(tree, 'minecraft:jungle_log');

        harness.neighborChanged(plant, 'west');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:vine');
        expect(harness.dimension.drops).toEqual([]);
    });

    it('pops a vine when its last attached face loses support', () => {
        const harness = bindFamily(climbingFamily, 'minecraft:vine');
        const support = { x: 1, y: 1, z: 0 };
        harness.dimension.set(plant, 'minecraft:vine', { vine_direction_bits: 8 });
        harness.dimension.set(support, 'minecraft:jungle_log');
        harness.dimension.set(support, AIR);

        harness.neighborChanged(plant, 'east');

        expect(harness.dimension.identifierAt(plant)).toBe(AIR);
    });

    it('keeps a vine when one of two attached faces loses support', () => {
        const harness = bindFamily(climbingFamily, 'minecraft:vine');
        const east = { x: 1, y: 1, z: 0 };
        const west = { x: -1, y: 1, z: 0 };
        harness.dimension.set(plant, 'minecraft:vine', { vine_direction_bits: 10 });
        harness.dimension.set(east, 'minecraft:jungle_log');
        harness.dimension.set(west, 'minecraft:jungle_log');
        harness.dimension.set(east, AIR);

        harness.neighborChanged(plant, 'east');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:vine');
    });

    it('keeps lichen on a side attachment when a different face changes', () => {
        const harness = bindFamily(climbingFamily, 'minecraft:glow_lichen');
        harness.dimension.set(plant, 'minecraft:glow_lichen', { multi_face_direction_bits: 32 });
        harness.dimension.set({ x: 1, y: 1, z: 0 }, 'minecraft:jungle_log');

        harness.neighborChanged(plant, 'west');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:glow_lichen');
        expect(harness.dimension.drops).toEqual([]);
    });

    it('keeps lichen when one of two attached faces loses support', () => {
        const harness = bindFamily(climbingFamily, 'minecraft:glow_lichen');
        const east = { x: 1, y: 1, z: 0 };
        const west = { x: -1, y: 1, z: 0 };
        harness.dimension.set(plant, 'minecraft:glow_lichen', { multi_face_direction_bits: 48 });
        harness.dimension.set(east, 'minecraft:jungle_log');
        harness.dimension.set(west, 'minecraft:jungle_log');
        harness.dimension.set(east, AIR);

        harness.neighborChanged(plant, 'east');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:glow_lichen');
    });

    it('pops lichen when its last attached face loses support', () => {
        const harness = bindFamily(climbingFamily, 'minecraft:glow_lichen');
        const east = { x: 1, y: 1, z: 0 };
        harness.dimension.set(plant, 'minecraft:glow_lichen', { multi_face_direction_bits: 32 });
        harness.dimension.set(east, AIR);

        harness.neighborChanged(plant, 'east');

        expect(harness.dimension.identifierAt(plant)).toBe(AIR);
    });

    it('checks the ground face for wildflowers', () => {
        const harness = bindFamily(climbingFamily, 'minecraft:wildflowers');
        harness.dimension.set(ground, 'minecraft:dirt');
        harness.dimension.set(plant, 'minecraft:wildflowers');

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:wildflowers');
    });

    it('keeps leaf litter on a sturdy top face', () => {
        const harness = bindFamily(climbingFamily, 'minecraft:leaf_litter');
        harness.dimension.set(ground, 'minecraft:stone');
        harness.dimension.set(plant, 'minecraft:leaf_litter');

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:leaf_litter');
    });

    it('keeps a vertical chain when its upper support remains', () => {
        const harness = bindFamily(climbingFamily, 'minecraft:chain');
        harness.dimension.set({ x: 0, y: 2, z: 0 }, 'minecraft:stone');
        harness.dimension.set(plant, 'minecraft:chain', { pillar_axis: 'y' });

        harness.neighborChanged(plant, 'up');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:chain');
    });

    it('pops a vertical chain when its last support goes', () => {
        const harness = bindFamily(climbingFamily, 'minecraft:chain');
        harness.dimension.set(plant, 'minecraft:chain', { pillar_axis: 'y' });

        harness.neighborChanged(plant, 'down');

        expect(harness.dimension.identifierAt(plant)).toBe(AIR);
    });

    it('ignores side changes to hanging roots and pops them when the ceiling goes', () => {
        const harness = bindFamily(climbingFamily, 'minecraft:hanging_roots');
        const ceiling = { x: 0, y: 2, z: 0 };
        harness.dimension.set(ceiling, 'minecraft:stone');
        harness.dimension.set(plant, 'minecraft:hanging_roots');

        harness.neighborChanged(plant, 'east');
        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:hanging_roots');

        harness.dimension.set(ceiling, AIR);
        harness.neighborChanged(plant, 'up');
        expect(harness.dimension.identifierAt(plant)).toBe(AIR);
    });

    it('keeps a hanging vine attached above through an up-face update', () => {
        const harness = bindFamily(climbingFamily, 'minecraft:weeping_vines');
        harness.dimension.set({ x: 0, y: 2, z: 0 }, 'minecraft:stone');
        harness.dimension.set(plant, 'minecraft:weeping_vines', { weeping_vines_age: 0 });

        harness.neighborChanged(plant, 'up');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:weeping_vines');
    });

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

    it('ignores changes on a ladder face away from its support', () => {
        const harness = bindFamily(climbingFamily, 'minecraft:ladder');
        harness.dimension.set({ x: 0, y: 1, z: -1 }, 'minecraft:stone');
        harness.dimension.set(plant, 'minecraft:ladder', { facing_direction: 3 });

        harness.neighborChanged(plant, 'east');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:ladder');
    });
});

describe('dripleafFamily', () => {
    it('keeps a ceiling-attached spore blossom when a side block changes', () => {
        const harness = bindFamily(dripleafFamily, 'minecraft:spore_blossom');
        harness.dimension.set({ x: 0, y: 2, z: 0 }, 'minecraft:oak_leaves');
        harness.dimension.set(plant, 'minecraft:spore_blossom');

        harness.neighborChanged(plant, 'west');

        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:spore_blossom');
        expect(harness.dimension.drops).toEqual([]);
    });

    it('pops a spore blossom when its ceiling support goes', () => {
        const harness = bindFamily(dripleafFamily, 'minecraft:spore_blossom');
        const ceiling = { x: 0, y: 2, z: 0 };
        harness.dimension.set(ceiling, 'minecraft:stone');
        harness.dimension.set(plant, 'minecraft:spore_blossom');
        harness.dimension.set(ceiling, AIR);

        harness.neighborChanged(plant, 'up');

        expect(harness.dimension.identifierAt(plant)).toBe(AIR);
    });

    it('ignores side changes to dripleaf and checks its lower support face', () => {
        const harness = bindFamily(dripleafFamily, 'minecraft:big_dripleaf');
        harness.dimension.set(plant, 'minecraft:big_dripleaf', { big_dripleaf_tilt: 'none' });

        harness.neighborChanged(plant, 'west');
        expect(harness.dimension.identifierAt(plant)).toBe('minecraft:big_dripleaf');

        harness.neighborChanged(plant, 'down');
        expect(harness.dimension.identifierAt(plant)).toBe(AIR);
    });

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
