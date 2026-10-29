import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../../.test/reportProgress';

import { WorldgenRandom } from '../placement/WorldgenRandom';
import { blockState, blockStateKey } from '../world/BlockState';
import { createTestOracle, TestFeatureWorld } from '../world/TestFeatureWorld';
import { parseBlockStateProvider } from './blockStateProvider';

const ORIGIN = { x: 0, y: 0, z: 0 };

const pick = (document: unknown, seed = 1n, position = ORIGIN, world = new TestFeatureWorld()) =>
    blockStateKey(parseBlockStateProvider(document, 'test').getState(world, new WorldgenRandom(seed), position));

describe('parseBlockStateProvider', () => {
    it('resolves a bare identifier through the provider registry', () => {
        const shared = parseBlockStateProvider({ id: 'minecraft:podzol' }, 'shared');
        const provider = parseBlockStateProvider('minecraft:podzol_beneath_tree', 'test', () => shared);
        expect(provider).toBe(shared);
    });

    it('treats a bare identifier as a simple provider when there is no registry', () => {
        expect(pick('minecraft:grass_block')).toBe('minecraft:grass_block');
    });

    it('reads the registered provider types', () => {
        const noise = { base_octave: -3, octave_count: 1, base_amplitude: 1 };
        const documents: Record<string, unknown> = {
            simple: { type: 'minecraft:simple', state: { id: 'minecraft:stone' } },
            weighted: { type: 'minecraft:weighted', entries: [{ data: { id: 'minecraft:stone' }, weight: 1 }] },
            noise: { type: 'minecraft:noise', seed: 2345, noise, scale: 1, states: [{ id: 'minecraft:stone' }] },
            dual_noise: {
                type: 'minecraft:dual_noise',
                seed: 2345,
                noise,
                scale: 1,
                slow_noise: noise,
                slow_scale: 1,
                variety: [1, 3],
                states: [{ id: 'minecraft:stone' }, { id: 'minecraft:dirt' }]
            },
            noise_threshold: {
                type: 'minecraft:noise_threshold',
                seed: 2345,
                noise,
                scale: 1,
                threshold: 0,
                high_chance: 0.5,
                default_state: { id: 'minecraft:stone' },
                low_states: [{ id: 'minecraft:dirt' }],
                high_states: [{ id: 'minecraft:gravel' }]
            },
            randomized_int: {
                type: 'minecraft:randomized_int',
                property: 'age',
                source: { id: 'minecraft:twisting_vines', properties: { age: '0' } },
                values: { type: 'minecraft:uniform', min_inclusive: 0, max_inclusive: 25 }
            },
            rotated: { type: 'minecraft:rotated', state: { id: 'minecraft:bone_block', properties: { axis: 'y' } } },
            rule_based: {
                type: 'minecraft:rule_based',
                fallback: { id: 'minecraft:sand' },
                rules: [{ if_true: { type: 'minecraft:true' }, then: { id: 'minecraft:sandstone' } }]
            },
            random_block: { type: 'minecraft:random_block', blocks: '#minecraft:corals' },
            copy_properties: {
                type: 'minecraft:copy_properties',
                source: { id: 'minecraft:oak_log', properties: { axis: 'y' } }
            }
        };

        reportProgress(`Block state provider behavior has fixtures for ${Object.keys(documents).length} types.`);
        for (const [name, document] of Object.entries(documents)) {
            expect(parseBlockStateProvider(document, name).type).toBe(name);
        }
    });

    it('treats a bare block state as a simple provider', () => {
        const provider = parseBlockStateProvider({ id: 'minecraft:oak_log', properties: { axis: 'y' } }, 'test');
        expect(provider.type).toBe('simple');
        expect(pick({ id: 'minecraft:oak_log', properties: { axis: 'y' } })).toBe('minecraft:oak_log[axis=y]');
    });

    it('refuses an unknown type', () => {
        expect(() => parseBlockStateProvider({ type: 'minecraft:nope' }, 'test')).toThrow(TypeError);
    });

    it('draws weighted entries in proportion', () => {
        const document = {
            type: 'minecraft:weighted',
            entries: [
                { data: { id: 'minecraft:dandelion' }, weight: 2 },
                { data: { id: 'minecraft:poppy' }, weight: 1 }
            ]
        };
        const provider = parseBlockStateProvider(document, 'test');
        const random = new WorldgenRandom(4n);
        const world = new TestFeatureWorld();
        let poppies = 0;
        for (let draw = 0; draw < 6000; draw++) {
            if (provider.getState(world, random, ORIGIN).name === 'minecraft:poppy') poppies++;
        }
        expect(poppies).toBeGreaterThan(1800);
        expect(poppies).toBeLessThan(2200);
    });

    it('picks a noise state from the position rather than the stream', () => {
        const document = {
            type: 'minecraft:noise',
            seed: 2345,
            noise: { base_octave: -3, octave_count: 1, base_amplitude: 1 },
            scale: 0.08,
            states: [{ id: 'minecraft:grass_block' }, { id: 'minecraft:podzol' }, { id: 'minecraft:coarse_dirt' }]
        };
        const provider = parseBlockStateProvider(document, 'test');
        const world = new TestFeatureWorld();
        const random = new WorldgenRandom(1n);
        const first = provider.getState(world, random, { x: 40, y: 64, z: 40 });
        const again = provider.getState(world, random, { x: 40, y: 64, z: 40 });
        expect(blockStateKey(again)).toBe(blockStateKey(first));

        const seen = new Set<string>();
        for (let x = 0; x < 400; x += 7) seen.add(provider.getState(world, random, { x, y: 64, z: x }).name);
        expect(seen.size).toBeGreaterThan(1);
    });

    it('randomizes an integer property declared on the source state', () => {
        const document = {
            type: 'minecraft:randomized_int',
            property: 'age',
            source: { id: 'minecraft:twisting_vines', properties: { age: '0' } },
            values: { type: 'minecraft:uniform', min_inclusive: 0, max_inclusive: 25 }
        };
        const provider = parseBlockStateProvider(document, 'test');
        const random = new WorldgenRandom(7n);
        const world = new TestFeatureWorld();
        const ages = new Set<string>();
        for (let draw = 0; draw < 500; draw++) {
            const age = provider.getState(world, random, ORIGIN).properties['age'];
            expect(age).toBeDefined();
            ages.add(age ?? '');
        }
        expect(ages.size).toBe(26);
        expect([...ages].every((age) => Number(age) >= 0 && Number(age) <= 25)).toBe(true);
    });

    it('leaves a state alone when the randomized property is not declared on it', () => {
        expect(
            pick({
                type: 'minecraft:randomized_int',
                property: 'age',
                source: { id: 'minecraft:stone' },
                values: 3
            })
        ).toBe('minecraft:stone');
    });

    it('turns a state to the declared direction', () => {
        expect(
            pick({
                type: 'minecraft:rotated',
                direction: 'north',
                state: { id: 'minecraft:dead_brain_coral_wall_fan', properties: { facing: 'north' } }
            })
        ).toBe('minecraft:dead_brain_coral_wall_fan[facing=north]');
        expect(
            pick({
                type: 'minecraft:rotated',
                direction: 'east',
                state: { id: 'minecraft:bone_block', properties: { axis: 'y' } }
            })
        ).toBe('minecraft:bone_block[axis=x]');
    });

    it('takes the first rule that holds and falls back when none does', () => {
        const document = {
            type: 'minecraft:rule_based',
            fallback: { id: 'minecraft:sand' },
            rules: [
                {
                    if_true: { type: 'minecraft:matching_blocks', blocks: 'minecraft:air', offset: [0, -1, 0] },
                    then: { id: 'minecraft:sandstone' }
                }
            ]
        };
        const grounded = new TestFeatureWorld();
        grounded.setBlock({ x: 0, y: -1, z: 0 }, blockState('minecraft:stone'));
        expect(pick(document)).toBe('minecraft:sandstone');
        expect(pick(document, 1n, ORIGIN, grounded)).toBe('minecraft:sand');
    });

    it('draws a random block out of a tag the oracle can enumerate', () => {
        const world = new TestFeatureWorld({
            blocks: createTestOracle({ tags: { 'minecraft:corals': ['minecraft:tube_coral', 'minecraft:fire_coral'] } })
        });
        const provider = parseBlockStateProvider(
            { type: 'minecraft:random_block', blocks: '#minecraft:corals' },
            'test'
        );
        const random = new WorldgenRandom(2n);
        const seen = new Set<string>();
        for (let draw = 0; draw < 200; draw++) seen.add(provider.getState(world, random, ORIGIN).name);
        expect([...seen].sort()).toEqual(['minecraft:fire_coral', 'minecraft:tube_coral']);
    });

    it('keeps the world block when the tag cannot be enumerated', () => {
        const world = new TestFeatureWorld();
        world.setBlock(ORIGIN, blockState('minecraft:water'));
        const provider = parseBlockStateProvider(
            { type: 'minecraft:random_block', blocks: '#minecraft:corals' },
            'test'
        );
        expect(provider.getState(world, new WorldgenRandom(2n), ORIGIN).name).toBe('minecraft:water');
        expect(provider.getOptionalState(world, new WorldgenRandom(2n), ORIGIN)).toBeUndefined();
    });

    it('copies the world block’s property values onto the source state', () => {
        const world = new TestFeatureWorld();
        world.setBlock(ORIGIN, blockState('minecraft:birch_log', { axis: 'x' }));
        expect(
            pick(
                { type: 'minecraft:copy_properties', source: { id: 'minecraft:oak_log', properties: { axis: 'y' } } },
                1n,
                ORIGIN,
                world
            )
        ).toBe('minecraft:oak_log[axis=x]');
    });

    it('splits on a noise threshold', () => {
        const document = {
            type: 'minecraft:noise_threshold',
            seed: 2345,
            noise: { base_octave: -3, octave_count: 1, base_amplitude: 1 },
            scale: 0.08,
            threshold: 0,
            high_chance: 1,
            default_state: { id: 'minecraft:stone' },
            low_states: [{ id: 'minecraft:dirt' }],
            high_states: [{ id: 'minecraft:gravel' }]
        };
        const provider = parseBlockStateProvider(document, 'test');
        const world = new TestFeatureWorld();
        const random = new WorldgenRandom(1n);
        const seen = new Set<string>();
        for (let x = 0; x < 400; x += 3) seen.add(provider.getState(world, random, { x, y: 10, z: x }).name);
        expect([...seen].sort()).toEqual(['minecraft:dirt', 'minecraft:gravel']);
    });

    it('limits dual noise to the declared variety', () => {
        const noise = { base_octave: -3, octave_count: 1, base_amplitude: 1 };
        const states = ['a', 'b', 'c', 'd', 'e', 'f'].map((suffix) => ({ id: `minecraft:${suffix}_block` }));
        const provider = parseBlockStateProvider(
            {
                type: 'minecraft:dual_noise',
                seed: 2345,
                noise,
                scale: 0.08,
                slow_noise: noise,
                slow_scale: 0.001,
                variety: [1, 2],
                states
            },
            'test'
        );
        const world = new TestFeatureWorld();
        const random = new WorldgenRandom(1n);
        const seen = new Set<string>();
        for (let x = 0; x < 200; x += 3) seen.add(provider.getState(world, random, { x, y: 10, z: x }).name);
        expect(seen.size).toBeLessThanOrEqual(states.length);
        expect(seen.size).toBeGreaterThan(0);
    });
});
