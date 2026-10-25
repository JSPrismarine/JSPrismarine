/**
 * What the oracle answers for `canSurvive`, the question that decides where a plant lands.
 *
 * The tags are written out here rather than read from the datapack, so the test runs without
 * the fetched Java sources and so the rule under test is visible next to its answer.
 */
import { TestFeatureWorld } from '@jsprismarine/features';
import { describe, expect, it } from 'vitest';

import { createJavaBlockOracle } from './javaBlockOracle';

/** The slice of `tags/block` the support rules read, with Java's own `#` references kept. */
const BLOCK_TAGS = new Map<string, unknown>([
    ['minecraft:dirt', { values: ['minecraft:dirt', 'minecraft:coarse_dirt', 'minecraft:rooted_dirt'] }],
    ['minecraft:mud', { values: ['minecraft:mud', 'minecraft:muddy_mangrove_roots'] }],
    ['minecraft:moss_blocks', { values: ['minecraft:moss_block', 'minecraft:pale_moss_block'] }],
    ['minecraft:grass_blocks', { values: ['minecraft:grass_block', 'minecraft:podzol', 'minecraft:mycelium'] }],
    [
        'minecraft:substrate_overworld',
        { values: ['#minecraft:dirt', '#minecraft:mud', '#minecraft:moss_blocks', '#minecraft:grass_blocks'] }
    ],
    ['minecraft:supports_vegetation', { values: ['#minecraft:substrate_overworld', 'minecraft:farmland'] }],
    ['minecraft:saplings', { values: ['minecraft:oak_sapling', 'minecraft:dark_oak_sapling'] }],
    ['minecraft:small_flowers', { values: ['minecraft:dandelion', 'minecraft:wither_rose'] }],
    [
        'minecraft:supports_wither_rose',
        { values: ['#minecraft:supports_vegetation', 'minecraft:netherrack', 'minecraft:soul_sand'] }
    ]
]);

const oracle = createJavaBlockOracle(BLOCK_TAGS);

/** A world holding one block at the origin, with the tested position one above it. */
const on = (below: string): TestFeatureWorld => {
    const world = new TestFeatureWorld({ blocks: oracle });
    world.setBlock({ x: 0, y: 0, z: 0 }, { name: below, properties: {} });
    return world;
};

const survives = (name: string, below: string): boolean =>
    oracle.canSurvive(on(below), { x: 0, y: 1, z: 0 }, { name, properties: {} });

describe('canSurvive', () => {
    it.each([
        'minecraft:brown_mushroom_block',
        'minecraft:red_mushroom_block',
        'minecraft:mushroom_stem',
        'minecraft:snow_block',
        'minecraft:packed_ice',
        'minecraft:stone',
        'minecraft:gravel',
        'minecraft:oak_log'
    ])('keeps a dark oak sapling off %s', (below) => {
        expect(survives('minecraft:dark_oak_sapling', below)).toBe(false);
    });

    it.each([
        'minecraft:grass_block',
        'minecraft:podzol',
        'minecraft:mycelium',
        'minecraft:dirt',
        'minecraft:coarse_dirt',
        'minecraft:rooted_dirt',
        'minecraft:mud',
        'minecraft:moss_block',
        'minecraft:farmland'
    ])('grows a dark oak sapling on %s', (below) => {
        expect(survives('minecraft:dark_oak_sapling', below)).toBe(true);
    });

    it('holds grass and flowers to the same tag the saplings use', () => {
        expect(survives('minecraft:short_grass', 'minecraft:stone')).toBe(false);
        expect(survives('minecraft:short_grass', 'minecraft:grass_block')).toBe(true);
        expect(survives('minecraft:dandelion', 'minecraft:gravel')).toBe(false);
        expect(survives('minecraft:dandelion', 'minecraft:dirt')).toBe(true);
    });

    it('gives the wither rose its own tag rather than the one small flowers share', () => {
        expect(survives('minecraft:wither_rose', 'minecraft:netherrack')).toBe(true);
        expect(survives('minecraft:dandelion', 'minecraft:netherrack')).toBe(false);
    });

    it('leaves leaf litter on the sturdy top face rule it overrides canSurvive with', () => {
        expect(survives('minecraft:leaf_litter', 'minecraft:stone')).toBe(true);
        expect(survives('minecraft:leaf_litter', 'minecraft:grass_block')).toBe(true);
        expect(survives('minecraft:leaf_litter', 'minecraft:air')).toBe(false);
    });

    it('falls back to the sturdy top face when the datapack carries no support tags', () => {
        const untagged = createJavaBlockOracle(new Map());
        const world = new TestFeatureWorld({ blocks: untagged });
        world.setBlock({ x: 0, y: 0, z: 0 }, { name: 'minecraft:stone', properties: {} });

        expect(untagged.canSurvive(world, { x: 0, y: 1, z: 0 }, { name: 'minecraft:fern', properties: {} })).toBe(true);
    });
});
