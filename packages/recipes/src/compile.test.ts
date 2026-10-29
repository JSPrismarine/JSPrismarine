import { javaItemToBedrock } from '@jsprismarine/mapping';
import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../.test/reportProgress';
import type { JavaItemMapper } from './compile';
import { BEDROCK_STATION_TAGS, compileRecipes } from './compile';
import { parseRecipe } from './parse';
import type { Recipe } from './types';

const recipeOf = (id: string, source: Record<string, unknown>): Recipe => {
    const { recipe, diagnostics } = parseRecipe(id, source);
    expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    return recipe!;
};

const torch = recipeOf('minecraft:torch', {
    type: 'minecraft:crafting_shaped',
    key: { C: 'minecraft:coal', S: 'minecraft:stick' },
    pattern: ['C', 'S'],
    result: { count: 4, id: 'minecraft:torch' }
});

describe('compileRecipes against the real mapping package', () => {
    it('translates identifiers and numbers recipes from registry order', () => {
        const report = compileRecipes([torch], javaItemToBedrock);

        expect(report.recipes).toHaveLength(1);
        expect(report.recipes[0]).toMatchObject({
            id: 'minecraft:torch',
            netId: 1,
            station: 'crafting',
            blockTags: ['crafting_table'],
            shape: { width: 1, height: 2 },
            result: { identifier: 'minecraft:torch', count: 4 }
        });
        expect(report.recipes[0]?.ingredients.map((ingredient) => ingredient?.items)).toEqual([
            [{ identifier: 'minecraft:coal' }],
            [{ identifier: 'minecraft:stick' }]
        ]);
        expect(report.losses).toEqual([]);
        expect(report.gaps).toEqual([]);
        expect(report.dropped).toEqual([]);
    });

    it('gives each station the Bedrock block tags the client expects', () => {
        const campfire = recipeOf('minecraft:cooked_beef_from_campfire_cooking', {
            type: 'minecraft:campfire_cooking',
            cookingtime: 600,
            experience: 0.35,
            ingredient: 'minecraft:beef',
            result: { id: 'minecraft:cooked_beef' }
        });

        expect(compileRecipes([campfire], javaItemToBedrock).recipes[0]?.blockTags).toEqual([
            'campfire',
            'soul_campfire'
        ]);
        reportProgress(`Recipe compilation maps ${Object.keys(BEDROCK_STATION_TAGS).length} Bedrock station tags.`);
    });

    it('reports a reviewed loss and keeps the recipe', () => {
        const spectral = recipeOf('minecraft:spectral_arrow', {
            type: 'minecraft:crafting_shaped',
            key: { G: 'minecraft:glowstone_dust', '#': 'minecraft:arrow' },
            pattern: [' G ', 'G#G', ' G '],
            result: { count: 2, id: 'minecraft:spectral_arrow' }
        });

        const report = compileRecipes([spectral], javaItemToBedrock);

        expect(report.recipes).toHaveLength(1);
        expect(report.losses).toEqual([
            {
                recipeId: 'minecraft:spectral_arrow',
                javaId: 'minecraft:spectral_arrow',
                where: 'result',
                reason: expect.stringContaining('Bedrock has no spectral arrow')
            }
        ]);
        expect(report.dropped).toEqual([]);
    });

    it('drops a recipe whose result has no Bedrock item and says which identifier cost it', () => {
        const mapper: JavaItemMapper = (javaId) =>
            javaId === 'minecraft:invented_thing'
                ? { kind: 'unknown', javaId }
                : { kind: 'mapped', bedrock: { identifier: javaId } };

        const invented = recipeOf('plugin:invented', {
            type: 'minecraft:crafting_shapeless',
            ingredients: ['minecraft:stick'],
            result: { id: 'minecraft:invented_thing' }
        });

        const report = compileRecipes([invented], mapper);

        expect(report.recipes).toEqual([]);
        expect(report.dropped).toEqual([{ recipeId: 'plugin:invented', javaId: 'minecraft:invented_thing' }]);
        expect(report.gaps).toEqual([
            { recipeId: 'plugin:invented', javaId: 'minecraft:invented_thing', where: 'result', dropped: true }
        ]);
    });

    it('keeps a recipe when only part of a tag ingredient is unmappable', () => {
        const mapper: JavaItemMapper = (javaId) =>
            javaId === 'minecraft:gone'
                ? { kind: 'unknown', javaId }
                : { kind: 'mapped', bedrock: { identifier: javaId } };

        const partial = recipeOf('plugin:partial', {
            type: 'minecraft:crafting_shapeless',
            ingredients: [['minecraft:stick', 'minecraft:gone']],
            result: { id: 'minecraft:torch' }
        });

        const report = compileRecipes([partial], mapper);

        expect(report.recipes[0]?.ingredients[0]?.items).toEqual([{ identifier: 'minecraft:stick' }]);
        expect(report.gaps).toEqual([
            { recipeId: 'plugin:partial', javaId: 'minecraft:gone', where: 'ingredient', dropped: false }
        ]);
        expect(report.dropped).toEqual([]);
    });

    it('drops a recipe when a whole ingredient becomes unmappable', () => {
        const mapper: JavaItemMapper = (javaId) =>
            javaId === 'minecraft:gone'
                ? { kind: 'unknown', javaId }
                : { kind: 'mapped', bedrock: { identifier: javaId } };

        const empty = recipeOf('plugin:empty', {
            type: 'minecraft:crafting_shapeless',
            ingredients: ['minecraft:gone'],
            result: { id: 'minecraft:torch' }
        });

        expect(compileRecipes([empty], mapper).dropped).toEqual([
            { recipeId: 'plugin:empty', javaId: 'minecraft:gone' }
        ]);
    });

    it('leaves the result off the recipes that build theirs from an input', () => {
        const repair = recipeOf('minecraft:repair_item', { type: 'minecraft:crafting_special_repairitem' });
        const cloning = recipeOf('minecraft:map_cloning', {
            type: 'minecraft:crafting_transmute',
            add_material_count_to_result: true,
            input: 'minecraft:filled_map',
            material: 'minecraft:map',
            material_count: { min: 1, max: 8 },
            result: {}
        });

        const report = compileRecipes([repair, cloning], javaItemToBedrock);

        expect(report.recipes.map((recipe) => recipe.result)).toEqual([undefined, undefined]);
        expect(report.dropped).toEqual([]);
    });

    it('keeps the Java tag names on a compiled ingredient', () => {
        const slab = recipeOf('minecraft:stone_slab', {
            type: 'minecraft:crafting_shaped',
            key: { '#': '#minecraft:stone_crafting_materials' },
            pattern: ['###'],
            result: { count: 6, id: 'minecraft:stone_slab' }
        });

        expect(compileRecipes([slab], javaItemToBedrock).recipes[0]?.ingredients[0]?.tags).toEqual([
            'minecraft:stone_crafting_materials'
        ]);
    });
});
