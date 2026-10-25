import { Molang } from '@jsprismarine/molang';
import { describe, expect, it } from 'vitest';
import type { BlockDefinitionDocument, } from './definition';
import { parseBlockDefinition } from './definition';
import { componentsForPermutation, conditionMatches, permutationsFor } from './permutations';

const molang = new Molang();

const shelfMushroom = (): BlockDefinitionDocument =>
    parseBlockDefinition(
        {
            format_version: '1.26.50',
            'minecraft:block': {
                description: {
                    identifier: 'minecraft:shelf_mushroom',
                    states: { growth: [0, 1], 'minecraft:cardinal_direction': ['north', 'south', 'west', 'east'] }
                },
                components: {
                    'minecraft:loot': 'loot_tables/blocks/shelf_mushroom_growth_0.json',
                    'minecraft:geometry': { identifier: 'minecraft:geometry.shelf_mushroom_small' }
                },
                permutations: [
                    {
                        condition: "query.block_state('growth') == 1",
                        components: { 'minecraft:loot': 'loot_tables/blocks/shelf_mushroom_growth_1.json' }
                    },
                    {
                        condition:
                            "query.block_state('growth') == 1 && query.block_state('minecraft:cardinal_direction') == 'north'",
                        components: {
                            'minecraft:geometry': { identifier: 'minecraft:geometry.shelf_mushroom_large' },
                            'minecraft:transformation': { rotation: [0, 90, 0] }
                        }
                    }
                ]
            }
        },
        { pack: 'test' }
    ).document!;

describe('a permutation condition', () => {
    it('reads a block state through query.block_state', () => {
        expect(conditionMatches(molang, "query.block_state('growth') == 1", { growth: 1 })).toBe(true);
        expect(conditionMatches(molang, "query.block_state('growth') == 1", { growth: 0 })).toBe(false);
    });

    it('compares a string state', () => {
        const condition = "query.block_state('minecraft:cardinal_direction') == 'south'";

        expect(conditionMatches(molang, condition, { 'minecraft:cardinal_direction': 'south' })).toBe(true);
        expect(conditionMatches(molang, condition, { 'minecraft:cardinal_direction': 'north' })).toBe(false);
    });

    it('does not match when the expression fails to parse', () => {
        expect(conditionMatches(molang, 'query.block_state(', { growth: 1 })).toBe(false);
    });

    it('lists the matching permutations in declaration order', () => {
        const document = shelfMushroom();

        expect(permutationsFor(document, { growth: 0, 'minecraft:cardinal_direction': 'north' }, molang)).toEqual([]);
        expect(permutationsFor(document, { growth: 1, 'minecraft:cardinal_direction': 'south' }, molang)).toEqual([0]);
        expect(permutationsFor(document, { growth: 1, 'minecraft:cardinal_direction': 'north' }, molang)).toEqual([
            0, 1
        ]);
    });
});

describe('merging a permutation over the base components', () => {
    it('keeps the base components when nothing matches', () => {
        const document = shelfMushroom();

        expect(componentsForPermutation(document, [])).toEqual([
            { name: 'minecraft:loot', value: 'loot_tables/blocks/shelf_mushroom_growth_0.json' },
            { name: 'minecraft:geometry', value: { identifier: 'minecraft:geometry.shelf_mushroom_small' } }
        ]);
    });

    it('lets the later entry win and marks it as an override', () => {
        const merged = componentsForPermutation(shelfMushroom(), [0, 1]);

        expect(merged).toEqual([
            {
                name: 'minecraft:loot',
                value: 'loot_tables/blocks/shelf_mushroom_growth_1.json',
                override: true
            },
            {
                name: 'minecraft:geometry',
                value: { identifier: 'minecraft:geometry.shelf_mushroom_large' },
                override: true
            },
            { name: 'minecraft:transformation', value: { rotation: [0, 90, 0] }, override: true }
        ]);
    });

    it('keeps a component at the position the base list gave it', () => {
        const merged = componentsForPermutation(shelfMushroom(), [1]);

        expect(merged.map((entry) => entry.name)).toEqual([
            'minecraft:loot',
            'minecraft:geometry',
            'minecraft:transformation'
        ]);
    });
});
