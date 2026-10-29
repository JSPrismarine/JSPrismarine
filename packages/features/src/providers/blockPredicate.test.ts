import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../../.test/reportProgress';

import { blockState } from '../world/BlockState';
import { createTestOracle, TestFeatureWorld } from '../world/TestFeatureWorld';
import { parseBlockPredicate } from './blockPredicate';

const STONE = blockState('minecraft:stone');
const DIRT = blockState('minecraft:dirt');
const WATER = blockState('minecraft:water');
const SAPLING = blockState('minecraft:oak_sapling');

const world = () =>
    new TestFeatureWorld({
        blocks: createTestOracle({
            nonSolid: ['minecraft:oak_sapling', 'minecraft:oak_leaves'],
            replaceable: ['minecraft:oak_sapling'],
            tags: {
                'minecraft:dirt': ['minecraft:dirt', 'minecraft:grass_block'],
                'minecraft:stone_ore_replaceables': ['minecraft:stone']
            }
        })
    });

const test = (document: unknown, position = { x: 0, y: 0, z: 0 }) =>
    parseBlockPredicate(document, 'test')(testWorld, position);

const testWorld = world();
testWorld.setBlock({ x: 0, y: 0, z: 0 }, STONE);
testWorld.setBlock({ x: 0, y: -1, z: 0 }, DIRT);
testWorld.setBlock({ x: 1, y: 0, z: 0 }, WATER);
testWorld.setBlock({ x: 2, y: 0, z: 0 }, SAPLING);

describe('parseBlockPredicate', () => {
    it('reads registered predicate types', () => {
        const documents: Record<string, unknown> = {
            matching_blocks: { type: 'minecraft:matching_blocks', blocks: 'minecraft:stone' },
            matching_block_tag: { type: 'minecraft:matching_block_tag', tag: 'minecraft:dirt' },
            matching_fluids: { type: 'minecraft:matching_fluids', fluids: 'minecraft:water' },
            matching_biomes: { type: 'minecraft:matching_biomes', biomes: 'minecraft:plains' },
            has_sturdy_face: { type: 'minecraft:has_sturdy_face', direction: 'up' },
            solid: { type: 'minecraft:solid' },
            replaceable: { type: 'minecraft:replaceable' },
            would_survive: { type: 'minecraft:would_survive', state: { id: 'minecraft:oak_sapling' } },
            inside_world_bounds: { type: 'minecraft:inside_world_bounds' },
            any_of: { type: 'minecraft:any_of', predicates: [{ type: 'minecraft:true' }] },
            all_of: { type: 'minecraft:all_of', predicates: [{ type: 'minecraft:true' }] },
            not: { type: 'minecraft:not', predicate: { type: 'minecraft:true' } },
            true: { type: 'minecraft:true' },
            unobstructed: { type: 'minecraft:unobstructed' },
            height_range: {
                type: 'minecraft:height_range',
                min_inclusive: { absolute: 0 },
                max_inclusive: { absolute: 10 }
            },
            volume_match: {
                type: 'minecraft:volume_match',
                min: [0, 0, 0],
                max: [0, 0, 0],
                match: { type: 'minecraft:true' }
            }
        };

        reportProgress(`Block predicate behavior has fixtures for ${Object.keys(documents).length} types.`);
        for (const [name, document] of Object.entries(documents)) {
            expect(() => parseBlockPredicate(document, name)).not.toThrow();
        }
    });

    it('refuses an unknown type', () => {
        expect(() => parseBlockPredicate({ type: 'minecraft:nope' }, 'test')).toThrow(TypeError);
    });

    it('matches a named block and rejects another', () => {
        expect(test({ type: 'minecraft:matching_blocks', blocks: 'minecraft:stone' })).toBe(true);
        expect(test({ type: 'minecraft:matching_blocks', blocks: 'minecraft:dirt' })).toBe(false);
        expect(test({ type: 'minecraft:matching_blocks', blocks: ['minecraft:dirt', 'minecraft:stone'] })).toBe(true);
    });

    it('resolves a tag reference spelled in the blocks field', () => {
        expect(test({ type: 'minecraft:matching_blocks', blocks: '#minecraft:dirt' }, { x: 0, y: -1, z: 0 })).toBe(
            true
        );
        expect(test({ type: 'minecraft:matching_blocks', blocks: '#minecraft:dirt' })).toBe(false);
    });

    it('applies the offset before reading the world', () => {
        expect(test({ type: 'minecraft:matching_blocks', blocks: 'minecraft:dirt', offset: [0, -1, 0] })).toBe(true);
    });

    it('matches fluids through waterlogging as well as fluid blocks', () => {
        expect(test({ type: 'minecraft:matching_fluids', fluids: 'minecraft:water' }, { x: 1, y: 0, z: 0 })).toBe(true);
        expect(test({ type: 'minecraft:matching_fluids', fluids: 'minecraft:empty' })).toBe(true);
        testWorld.setBlock({ x: 5, y: 0, z: 0 }, blockState('minecraft:oak_leaves', { waterlogged: 'true' }));
        expect(test({ type: 'minecraft:matching_fluids', fluids: 'minecraft:water' }, { x: 5, y: 0, z: 0 })).toBe(true);
    });

    it('answers solid, replaceable and sturdy from the oracle', () => {
        expect(test({ type: 'minecraft:solid' })).toBe(true);
        expect(test({ type: 'minecraft:solid' }, { x: 2, y: 0, z: 0 })).toBe(false);
        expect(test({ type: 'minecraft:replaceable' }, { x: 2, y: 0, z: 0 })).toBe(true);
        expect(test({ type: 'minecraft:has_sturdy_face', direction: 'up' })).toBe(true);
    });

    it('asks the oracle whether a state would survive', () => {
        const document = { type: 'minecraft:would_survive', state: { id: 'minecraft:oak_sapling' } };
        expect(test(document, { x: 0, y: 1, z: 0 })).toBe(true);
        expect(test(document, { x: 0, y: 40, z: 0 })).toBe(false);
    });

    it('bounds a position against the dimension', () => {
        expect(test({ type: 'minecraft:inside_world_bounds' })).toBe(true);
        expect(test({ type: 'minecraft:inside_world_bounds' }, { x: 0, y: -200, z: 0 })).toBe(false);
        expect(test({ type: 'minecraft:inside_world_bounds', offset: [0, -200, 0] })).toBe(false);
    });

    it('combines with all_of, any_of and not', () => {
        const stone = { type: 'minecraft:matching_blocks', blocks: 'minecraft:stone' };
        const dirt = { type: 'minecraft:matching_blocks', blocks: 'minecraft:dirt' };
        expect(test({ type: 'minecraft:all_of', predicates: [stone, dirt] })).toBe(false);
        expect(test({ type: 'minecraft:any_of', predicates: [stone, dirt] })).toBe(true);
        expect(test({ type: 'minecraft:not', predicate: dirt })).toBe(true);
    });

    it('resolves height_range anchors against the world', () => {
        const document = {
            type: 'minecraft:height_range',
            min_inclusive: { above_bottom: 0 },
            max_inclusive: { relative_to_sea_level: 0 }
        };
        expect(test(document, { x: 0, y: 0, z: 0 })).toBe(true);
        expect(test(document, { x: 0, y: 64, z: 0 })).toBe(false);
    });

    it('requires every position of a volume to match', () => {
        const document = {
            type: 'minecraft:volume_match',
            min: [0, -1, 0],
            max: [0, 0, 0],
            match: { type: 'minecraft:solid' }
        };
        expect(test(document)).toBe(true);
        expect(test(document, { x: 2, y: 0, z: 0 })).toBe(false);
    });

    it('passes `unobstructed` when the oracle cannot answer', () => {
        expect(test({ type: 'minecraft:unobstructed' })).toBe(true);
    });

    it('matches a biome by name and not by tag', () => {
        expect(test({ type: 'minecraft:matching_biomes', biomes: 'minecraft:plains' })).toBe(true);
        expect(test({ type: 'minecraft:matching_biomes', biomes: 'minecraft:desert' })).toBe(false);
        expect(test({ type: 'minecraft:matching_biomes', biomes: '#minecraft:is_overworld' })).toBe(false);
    });
});
