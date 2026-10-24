import { describe, expect, it } from 'vitest';

import type { TagLookup } from './ingredient';
import { ingredientAccepts, parseIngredient } from './ingredient';

const tags: TagLookup = (registry, tag) => {
    const table: Record<string, readonly string[]> = {
        'item minecraft:planks': ['minecraft:oak_planks', 'minecraft:birch_planks'],
        'item minecraft:coals': ['minecraft:coal', 'minecraft:charcoal'],
        'potion minecraft:long_potions': ['minecraft:long_strength']
    };
    return table[`${registry} ${tag}`];
};

const stack = (id: string, components?: Record<string, unknown>) => ({
    id,
    count: 1,
    ...(components ? { components } : {})
});

describe('parseIngredient', () => {
    it('reads the plain identifier form', () => {
        const { ingredient, diagnostics } = parseIngredient('minecraft:stick', 'ingredient');

        expect(diagnostics).toEqual([]);
        expect(ingredient?.items).toEqual(['minecraft:stick']);
        expect(ingredient?.tags).toEqual([]);
    });

    it('prefixes a bare identifier with the minecraft namespace', () => {
        expect(parseIngredient('stick', 'ingredient').ingredient?.items).toEqual(['minecraft:stick']);
    });

    it('reads the tag form through the injected lookup', () => {
        const { ingredient, diagnostics } = parseIngredient('#minecraft:planks', 'ingredient', tags);

        expect(diagnostics).toEqual([]);
        expect(ingredient?.items).toEqual(['minecraft:oak_planks', 'minecraft:birch_planks']);
        expect(ingredient?.tags).toEqual(['minecraft:planks']);
    });

    it('warns and accepts nothing when a tag does not resolve', () => {
        const { ingredient, diagnostics } = parseIngredient('#minecraft:unknown', 'ingredient', tags);

        expect(ingredient?.items).toEqual([]);
        expect(diagnostics).toEqual([
            {
                severity: 'warning',
                path: 'ingredient',
                message: 'the item tag minecraft:unknown resolved to nothing; the ingredient accepts no item from it'
            }
        ]);
    });

    it('reads the list form and removes duplicates', () => {
        const { ingredient } = parseIngredient(
            ['minecraft:coal', 'minecraft:charcoal', 'minecraft:coal'],
            'ingredient'
        );

        expect(ingredient?.items).toEqual(['minecraft:coal', 'minecraft:charcoal']);
    });

    it('resolves a tag written inside a list', () => {
        const { ingredient } = parseIngredient(['#minecraft:coals', 'minecraft:stick'], 'ingredient', tags);

        expect(ingredient?.items).toEqual(['minecraft:coal', 'minecraft:charcoal', 'minecraft:stick']);
        expect(ingredient?.tags).toEqual(['minecraft:coals']);
    });

    it('reads the inline form with its component predicates', () => {
        const { ingredient, diagnostics } = parseIngredient(
            { item: 'minecraft:potion', potion_contents: { potions: 'minecraft:awkward' } },
            'input',
            tags
        );

        expect(diagnostics).toEqual([]);
        expect(ingredient?.items).toEqual(['minecraft:potion']);
        expect(ingredient?.components).toEqual([
            {
                component: 'minecraft:potion_contents',
                value: { potions: 'minecraft:awkward' },
                potions: ['minecraft:awkward']
            }
        ]);
    });

    it('resolves a potion tag inside a potion predicate', () => {
        const { ingredient } = parseIngredient(
            { item: 'minecraft:potion', potion_contents: { potions: '#minecraft:long_potions' } },
            'input',
            tags
        );

        expect(ingredient?.components[0]?.potions).toEqual(['minecraft:long_strength']);
    });

    it('rejects an inline form with no item', () => {
        const { ingredient, diagnostics } = parseIngredient({ potion_contents: {} }, 'input');

        expect(ingredient).toBeUndefined();
        expect(diagnostics).toEqual([
            { severity: 'error', path: 'input', message: 'an inline ingredient has to name an `item`' }
        ]);
    });

    it('rejects an empty list and a non-string scalar', () => {
        expect(parseIngredient([], 'ingredient').ingredient).toBeUndefined();
        expect(parseIngredient(7, 'ingredient').ingredient).toBeUndefined();
        expect(parseIngredient(null, 'ingredient').diagnostics[0]?.severity).toBe('error');
    });
});

describe('ingredientAccepts', () => {
    const planks = parseIngredient('#minecraft:planks', 'ingredient', tags).ingredient!;

    it('accepts a tag member and rejects a non-member', () => {
        expect(ingredientAccepts(planks, stack('minecraft:oak_planks'))).toBe(true);
        expect(ingredientAccepts(planks, stack('minecraft:stone'))).toBe(false);
    });

    it('rejects an empty slot and a zero-count stack', () => {
        expect(ingredientAccepts(planks, null)).toBe(false);
        expect(ingredientAccepts(planks, { id: 'minecraft:oak_planks', count: 0 })).toBe(false);
    });

    it('matches a potion predicate against both component forms', () => {
        const awkward = parseIngredient(
            { item: 'minecraft:potion', potion_contents: { potions: 'minecraft:awkward' } },
            'input'
        ).ingredient!;

        expect(
            ingredientAccepts(awkward, stack('minecraft:potion', { 'minecraft:potion_contents': 'minecraft:awkward' }))
        ).toBe(true);
        expect(
            ingredientAccepts(
                awkward,
                stack('minecraft:potion', { 'minecraft:potion_contents': { potion: 'minecraft:awkward' } })
            )
        ).toBe(true);
        expect(
            ingredientAccepts(awkward, stack('minecraft:potion', { 'minecraft:potion_contents': 'minecraft:water' }))
        ).toBe(false);
        expect(ingredientAccepts(awkward, stack('minecraft:potion'))).toBe(false);
    });

    it('compares an unrecognized component predicate structurally', () => {
        const custom = parseIngredient(
            { item: 'minecraft:stick', custom_data: { marker: 1 } },
            'ingredient'
        ).ingredient!;

        expect(ingredientAccepts(custom, stack('minecraft:stick', { 'minecraft:custom_data': { marker: 1 } }))).toBe(
            true
        );
        expect(ingredientAccepts(custom, stack('minecraft:stick', { 'minecraft:custom_data': { marker: 2 } }))).toBe(
            false
        );
    });
});
