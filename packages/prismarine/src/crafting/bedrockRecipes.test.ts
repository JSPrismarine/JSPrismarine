import type { Diagnostic } from '@jsprismarine/content';
import type { Definition } from '@jsprismarine/packs';
import { describe, expect, it } from 'vitest';

import { definitionOf } from '../content/ContentOptions';
import { javaRecipesFromBedrock } from './bedrockRecipes';

/** Translates one Bedrock recipe body under `kind`, returning the Java files and the findings. */
const translate = (
    kind: string,
    body: Record<string, unknown>,
    identifier = 'test:recipe',
    bedrockItemTag?: (tag: string) => readonly string[] | undefined
) => {
    const diagnostics: Diagnostic[] = [];
    const definition: Definition = definitionOf(
        'recipes',
        identifier,
        { format_version: '1.20.10', [kind]: { description: { identifier }, ...body } },
        'Test pack'
    );
    const { recipes, materialReductions } = javaRecipesFromBedrock(
        new Map([[identifier, definition]]),
        diagnostics,
        bedrockItemTag
    );
    return {
        recipes: recipes.map(({ id, data }) => ({ id, data })),
        materialReductions: materialReductions.map(({ id, input, outputs }) => ({ id, input, outputs })),
        diagnostics
    };
};

describe('javaRecipesFromBedrock', () => {
    it('restates the shapeless recipe of issue #3835 as a Java crafting recipe', () => {
        const { recipes, diagnostics } = translate(
            'minecraft:recipe_shapeless',
            {
                tags: ['crafting_table'],
                ingredients: [{ item: 'minecraft:dirt' }],
                result: { item: 'minecraft:cobblestone' }
            },
            'test:dirt_to_cobblestone'
        );

        expect(diagnostics).toEqual([]);
        expect(recipes).toEqual([
            {
                id: 'test:dirt_to_cobblestone',
                data: {
                    type: 'minecraft:crafting_shapeless',
                    ingredients: ['minecraft:dirt'],
                    result: { id: 'minecraft:cobblestone' }
                }
            }
        ]);
    });

    it('writes an ingredient count out as that many ingredients', () => {
        const { recipes } = translate('minecraft:recipe_shapeless', {
            tags: ['crafting_table'],
            ingredients: [{ item: 'minecraft:dirt', count: 3 }, 'minecraft:stick'],
            result: { item: 'minecraft:cobblestone', count: 2 }
        });

        expect(recipes[0]?.data).toMatchObject({
            ingredients: ['minecraft:dirt', 'minecraft:dirt', 'minecraft:dirt', 'minecraft:stick'],
            result: { id: 'minecraft:cobblestone', count: 2 }
        });
    });

    it('restates a shaped recipe, resolving data values and tags', () => {
        const { recipes, diagnostics } = translate('minecraft:recipe_shaped', {
            tags: ['crafting_table'],
            group: 'banners',
            pattern: ['#S', 'P '],
            key: {
                '#': { item: 'minecraft:banner', data: 1 },
                S: 'minecraft:stick',
                P: { tag: 'minecraft:planks' }
            },
            result: { item: 'minecraft:bed', data: 14 }
        });

        expect(diagnostics).toEqual([]);
        expect(recipes[0]?.data).toEqual({
            type: 'minecraft:crafting_shaped',
            group: 'banners',
            pattern: ['#S', 'P '],
            key: { '#': 'minecraft:red_banner', S: 'minecraft:stick', P: '#minecraft:planks' },
            result: { id: 'minecraft:red_bed' }
        });
    });

    it('pads a pattern row shorter than the longest with empty cells', () => {
        const { recipes, diagnostics } = translate('minecraft:recipe_shaped', {
            tags: ['crafting_table'],
            pattern: ['#', '##', '###'],
            key: { '#': 'minecraft:cobblestone' },
            result: 'minecraft:stick'
        });

        expect(diagnostics).toEqual([]);
        expect(recipes[0]?.data['pattern']).toEqual(['#  ', '## ', '###']);
    });

    it("renames a legacy item name through Bedrock's alias table", () => {
        const { recipes, diagnostics } = translate('minecraft:recipe_shapeless', {
            tags: ['crafting_table'],
            ingredients: [{ item: 'minecraft:boat', data: 4 }],
            result: 'minecraft:stick'
        });

        expect(diagnostics).toEqual([]);
        expect(recipes[0]?.data['ingredients']).toEqual(['minecraft:acacia_boat']);
    });

    it('reads item and potion names in any case, as Bedrock does', () => {
        const furnace = translate('minecraft:recipe_furnace', {
            tags: ['furnace'],
            input: 'minecraft:muttonRaw',
            output: 'minecraft:muttonCooked'
        });
        const brew = translate('minecraft:recipe_brewing_mix', {
            tags: ['brewing_stand'],
            input: 'minecraft:potion_type:water',
            reagent: 'minecraft:glowstone_dust',
            output: 'minecraft:potion_type:Thick'
        });

        expect([...furnace.diagnostics, ...brew.diagnostics]).toEqual([]);
        expect(furnace.recipes[0]?.data).toMatchObject({
            ingredient: 'minecraft:mutton',
            result: { id: 'minecraft:cooked_mutton' }
        });
        expect(brew.recipes[0]?.data['output']).toEqual({
            id: 'minecraft:potion',
            components: { 'minecraft:potion_contents': { potion: 'minecraft:thick' } }
        });
    });

    it("reads a tag ingredient as Bedrock's tag when Bedrock knows it", () => {
        const { recipes } = translate(
            'minecraft:recipe_shaped',
            {
                tags: ['crafting_table'],
                pattern: ['E', 'P'],
                key: { E: { tag: 'minecraft:egg' }, P: { tag: 'minecraft:planks' } },
                result: 'minecraft:cake'
            },
            'test:cake',
            (tag) => (tag === 'minecraft:egg' ? ['minecraft:egg', 'minecraft:blue_egg'] : undefined)
        );

        expect(recipes[0]?.data['key']).toEqual({
            E: ['minecraft:egg', 'minecraft:blue_egg'],
            P: '#minecraft:planks'
        });
    });

    it('accepts every Java item a Bedrock identifier covers when the ingredient names no data value', () => {
        const { recipes } = translate('minecraft:recipe_shapeless', {
            tags: ['crafting_table'],
            ingredients: ['minecraft:arrow'],
            result: 'minecraft:stick'
        });

        expect(recipes[0]?.data['ingredients']).toEqual([['minecraft:arrow', 'minecraft:tipped_arrow']]);
    });

    it('keeps a custom item identifier as it is', () => {
        const { recipes, diagnostics } = translate('minecraft:recipe_shapeless', {
            tags: ['crafting_table'],
            ingredients: ['test:gem'],
            result: { item: 'test:gem_block' }
        });

        expect(diagnostics).toEqual([]);
        expect(recipes[0]?.data).toMatchObject({ ingredients: ['test:gem'], result: { id: 'test:gem_block' } });
    });

    it('gives a furnace recipe one cooking recipe per station, each named after its station', () => {
        const { recipes, diagnostics } = translate(
            'minecraft:recipe_furnace',
            {
                tags: ['furnace', 'blast_furnace', 'campfire', 'soul_campfire'],
                input: 'minecraft:iron_ore',
                output: 'minecraft:iron_ingot'
            },
            'test:iron'
        );

        expect(diagnostics).toEqual([]);
        expect(recipes.map(({ id, data }) => [id, data['type']])).toEqual([
            ['test:iron_from_smelting', 'minecraft:smelting'],
            ['test:iron_from_blasting', 'minecraft:blasting'],
            ['test:iron_from_campfire_cooking', 'minecraft:campfire_cooking']
        ]);
        expect(recipes[0]?.data).toMatchObject({
            ingredient: 'minecraft:iron_ore',
            result: { id: 'minecraft:iron_ingot' }
        });
    });

    it('makes a one-ingredient shapeless recipe at a stonecutter a stonecutting recipe', () => {
        const { recipes } = translate('minecraft:recipe_shapeless', {
            tags: ['stonecutter'],
            ingredients: ['minecraft:cobblestone'],
            result: { item: 'minecraft:stick', count: 4 }
        });

        expect(recipes[0]?.data).toEqual({
            type: 'minecraft:stonecutting',
            ingredient: 'minecraft:cobblestone',
            result: { id: 'minecraft:stick', count: 4 }
        });
    });

    it('restates a smithing transform', () => {
        const { recipes } = translate('minecraft:recipe_smithing_transform', {
            tags: ['smithing_table'],
            template: 'minecraft:netherite_upgrade_smithing_template',
            base: 'minecraft:diamond_sword',
            addition: 'minecraft:netherite_ingot',
            result: 'minecraft:netherite_sword'
        });

        expect(recipes[0]?.data).toEqual({
            type: 'minecraft:smithing_transform',
            template: 'minecraft:netherite_upgrade_smithing_template',
            base: 'minecraft:diamond_sword',
            addition: 'minecraft:netherite_ingot',
            result: { id: 'minecraft:netherite_sword' }
        });
    });

    // Issue #3838: these four types once loaded as nothing.
    it('gives a brewing mix one Java brewing recipe per potion container', () => {
        const { recipes, diagnostics } = translate(
            'minecraft:recipe_brewing_mix',
            {
                tags: ['brewing_stand'],
                input: 'minecraft:potion_type:awkward',
                reagent: 'minecraft:golden_carrot',
                output: 'minecraft:potion_type:nightvision'
            },
            'test:night_vision'
        );

        expect(diagnostics).toEqual([]);
        expect(recipes.map(({ id }) => id)).toEqual([
            'test:night_vision_potion',
            'test:night_vision_splash_potion',
            'test:night_vision_lingering_potion'
        ]);
        expect(recipes[1]?.data).toEqual({
            type: 'minecraft:brewing',
            input: { item: 'minecraft:splash_potion', potion_contents: { potions: 'minecraft:awkward' } },
            reagent: 'minecraft:golden_carrot',
            output: {
                id: 'minecraft:splash_potion',
                components: { 'minecraft:potion_contents': { potion: 'minecraft:night_vision' } }
            }
        });
    });

    it('reports a brewing mix naming a potion Java does not have', () => {
        const { recipes, diagnostics } = translate('minecraft:recipe_brewing_mix', {
            tags: ['brewing_stand'],
            input: 'minecraft:potion_type:mundane',
            reagent: 'minecraft:redstone',
            output: 'minecraft:potion_type:long_mundane'
        });

        expect(recipes).toEqual([]);
        expect(diagnostics).toEqual([expect.objectContaining({ severity: 'error', code: 'recipe.invalid' })]);
    });

    it('gives a brewing container recipe one Java brewing recipe per potion, keeping the potion', () => {
        const { recipes, diagnostics } = translate(
            'minecraft:recipe_brewing_container',
            {
                tags: ['brewing_stand'],
                input: 'minecraft:potion',
                reagent: 'minecraft:gunpowder',
                output: 'minecraft:splash_potion'
            },
            'test:splash'
        );

        expect(diagnostics).toEqual([]);
        expect(recipes.find(({ id }) => id === 'test:splash_strength')?.data).toEqual({
            type: 'minecraft:brewing',
            input: { item: 'minecraft:potion', potion_contents: { potions: 'minecraft:strength' } },
            reagent: 'minecraft:gunpowder',
            output: {
                id: 'minecraft:splash_potion',
                components: { 'minecraft:potion_contents': { potion: 'minecraft:strength' } }
            }
        });
        expect(recipes.length).toBeGreaterThan(1);
    });

    it('gives a smithing trim one Java trim recipe per template, naming the pattern after it', () => {
        const { recipes, diagnostics } = translate(
            'minecraft:recipe_smithing_trim',
            {
                tags: ['smithing_table'],
                template: { tag: 'test:templates' },
                base: 'minecraft:iron_chestplate',
                addition: 'minecraft:gold_ingot'
            },
            'test:trim',
            (tag) =>
                tag === 'test:templates'
                    ? ['minecraft:coast_armor_trim_smithing_template', 'minecraft:bolt_armor_trim_smithing_template']
                    : undefined
        );

        expect(diagnostics).toEqual([]);
        expect(recipes).toEqual([
            {
                id: 'test:trim_coast',
                data: {
                    type: 'minecraft:smithing_trim',
                    template: 'minecraft:coast_armor_trim_smithing_template',
                    base: 'minecraft:iron_chestplate',
                    addition: 'minecraft:gold_ingot',
                    pattern: 'minecraft:coast'
                }
            },
            expect.objectContaining({
                id: 'test:trim_bolt',
                data: expect.objectContaining({ pattern: 'minecraft:bolt' })
            })
        ]);
    });

    it('reports a trim template that names no pattern', () => {
        const { recipes, diagnostics } = translate('minecraft:recipe_smithing_trim', {
            tags: ['smithing_table'],
            template: 'minecraft:stick',
            base: 'minecraft:iron_chestplate',
            addition: 'minecraft:gold_ingot'
        });

        expect(recipes).toEqual([]);
        expect(diagnostics).toEqual([expect.objectContaining({ severity: 'error', code: 'recipe.invalid' })]);
    });

    it('keeps a material reduction in Bedrock names, outside the Java recipes', () => {
        const { recipes, materialReductions, diagnostics } = translate(
            'minecraft:recipe_material_reduction',
            {
                tags: 'material_reducer',
                input: 'minecraft:andesite_slab',
                output: [
                    { item: 'minecraft:element_14', count: 33 },
                    { item: 'minecraft:element_8', count: 64 }
                ]
            },
            'test:reduce'
        );

        expect(diagnostics).toEqual([]);
        expect(recipes).toEqual([]);
        expect(materialReductions).toEqual([
            {
                id: 'test:reduce',
                input: { identifier: 'minecraft:andesite_slab', data: 0 },
                outputs: [
                    { identifier: 'minecraft:element_14', count: 33 },
                    { identifier: 'minecraft:element_8', count: 64 }
                ]
            }
        ]);
    });

    it('warns about and leaves out a recipe type it does not read', () => {
        const { recipes, diagnostics } = translate('minecraft:recipe_shaped_chemistry', {
            tags: ['lab_table'],
            pattern: ['#'],
            key: { '#': 'minecraft:dirt' },
            result: 'minecraft:cobblestone'
        });

        expect(recipes).toEqual([]);
        expect(diagnostics).toEqual([
            expect.objectContaining({
                severity: 'warning',
                code: 'recipe.unsupported',
                pack: 'Test pack',
                path: 'recipes/test:recipe.json'
            })
        ]);
    });

    it('warns about and leaves out a recipe made only at a station Java does not have', () => {
        const { recipes, diagnostics } = translate('minecraft:recipe_shaped', {
            tags: ['test:workbench'],
            pattern: ['#'],
            key: { '#': 'minecraft:dirt' },
            result: 'minecraft:cobblestone'
        });

        expect(recipes).toEqual([]);
        expect(diagnostics.map(({ severity, code }) => [severity, code])).toEqual([
            ['warning', 'recipe.unsupported'],
            ['warning', 'recipe.unsupported']
        ]);
    });

    it('reports an error and leaves out a recipe naming a vanilla item Java does not have', () => {
        const { recipes, diagnostics } = translate('minecraft:recipe_shapeless', {
            tags: ['crafting_table'],
            ingredients: ['minecraft:not_an_item'],
            result: 'minecraft:cobblestone'
        });

        expect(recipes).toEqual([]);
        expect(diagnostics).toEqual([
            expect.objectContaining({ severity: 'error', code: 'recipe.invalid', pack: 'Test pack' })
        ]);
    });
});
