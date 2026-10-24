import { describe, expect, it } from 'vitest';

import type { TagLookup } from './ingredient';
import { parseRecipe } from './parse';
import { RECIPE_TYPES, recipeIngredients } from './types';

/**
 * Tag members for the tags the sampled vanilla recipes reference. Every case
 * below is a real Java 26.3 recipe file, copied verbatim.
 */
const tags: TagLookup = (registry, tag) => {
    if (registry !== 'item') return undefined;
    const table: Record<string, readonly string[]> = {
        'minecraft:banners': ['minecraft:white_banner', 'minecraft:red_banner'],
        'minecraft:book_cloning_target': ['minecraft:writable_book'],
        'minecraft:bundles': ['minecraft:bundle', 'minecraft:red_bundle'],
        'minecraft:clonable_maps': ['minecraft:filled_map'],
        'minecraft:decorated_pot_ingredients': ['minecraft:brick', 'minecraft:angler_pottery_sherd'],
        'minecraft:dyes': ['minecraft:red_dye', 'minecraft:blue_dye'],
        'minecraft:extendable_maps': ['minecraft:filled_map'],
        'minecraft:netherite_tool_materials': ['minecraft:netherite_ingot'],
        'minecraft:planks': ['minecraft:oak_planks'],
        'minecraft:shulker_boxes': ['minecraft:shulker_box'],
        'minecraft:skulls': ['minecraft:creeper_head'],
        'minecraft:trim_materials': ['minecraft:emerald'],
        'minecraft:trimmable_armor': ['minecraft:iron_chestplate']
    };
    return table[tag];
};

const parse = (id: string, source: unknown) => {
    const { recipe, diagnostics } = parseRecipe(id, source, tags);
    expect(diagnostics).toEqual([]);
    expect(recipe).toBeDefined();
    return recipe!;
};

describe('parseRecipe over every Java 26.3 serializer', () => {
    it('reads minecraft:crafting_shaped', () => {
        const recipe = parse('minecraft:acacia_door', {
            type: 'minecraft:crafting_shaped',
            category: 'redstone',
            group: 'wooden_door',
            key: { '#': 'minecraft:acacia_planks' },
            pattern: ['##', '##', '##'],
            result: { count: 3, id: 'minecraft:acacia_door' }
        });

        expect(recipe).toMatchObject({
            type: 'minecraft:crafting_shaped',
            station: 'crafting',
            group: 'wooden_door',
            category: 'redstone',
            showNotification: true,
            result: { id: 'minecraft:acacia_door', count: 3 }
        });
        expect(recipe.type === 'minecraft:crafting_shaped' && recipe.pattern.width).toBe(2);
        expect(recipe.type === 'minecraft:crafting_shaped' && recipe.pattern.height).toBe(3);
        expect(recipeIngredients(recipe)).toHaveLength(6);
    });

    it('reads a shaped pattern with gaps and keeps show_notification', () => {
        const recipe = parse('minecraft:crafting_table', {
            type: 'minecraft:crafting_shaped',
            key: { '#': '#minecraft:planks' },
            pattern: ['##', '##'],
            result: { id: 'minecraft:crafting_table' },
            show_notification: false
        });

        expect(recipe.type === 'minecraft:crafting_shaped' && recipe.showNotification).toBe(false);

        const boat = parse('minecraft:acacia_boat', {
            type: 'minecraft:crafting_shaped',
            key: { '#': 'minecraft:acacia_planks' },
            pattern: ['# #', '###'],
            result: { id: 'minecraft:acacia_boat' }
        });

        expect(recipeIngredients(boat).map((cell) => cell === null)).toEqual([false, true, false, false, false, false]);
    });

    it('trims the padding columns off a pattern, as Java does when it loads one', () => {
        const recipe = parse('minecraft:spyglass', {
            type: 'minecraft:crafting_shaped',
            category: 'equipment',
            key: { '#': 'minecraft:amethyst_shard', X: 'minecraft:copper_ingot' },
            pattern: [' # ', ' X ', ' X '],
            result: { id: 'minecraft:spyglass' }
        });

        expect(recipe.type === 'minecraft:crafting_shaped' && recipe.pattern).toMatchObject({ width: 1, height: 3 });
        expect(recipeIngredients(recipe).map((cell) => cell?.items[0])).toEqual([
            'minecraft:amethyst_shard',
            'minecraft:copper_ingot',
            'minecraft:copper_ingot'
        ]);
    });

    it('reads minecraft:crafting_shapeless', () => {
        const recipe = parse('minecraft:mushroom_stew', {
            type: 'minecraft:crafting_shapeless',
            group: 'mushroom_stew',
            ingredients: ['minecraft:brown_mushroom', 'minecraft:red_mushroom', 'minecraft:bowl'],
            result: { id: 'minecraft:mushroom_stew' }
        });

        expect(recipe.type === 'minecraft:crafting_shapeless' && recipe.ingredients).toHaveLength(3);
    });

    it('reads minecraft:crafting_transmute with its material count range', () => {
        const dye = parse('minecraft:black_shulker_box', {
            type: 'minecraft:crafting_transmute',
            group: 'shulker_box_dye',
            input: '#minecraft:shulker_boxes',
            material: 'minecraft:black_dye',
            result: { id: 'minecraft:black_shulker_box' }
        });

        expect(dye).toMatchObject({ materialCount: { min: 1, max: 1 }, addMaterialCountToResult: false });

        const cloning = parse('minecraft:map_cloning', {
            type: 'minecraft:crafting_transmute',
            add_material_count_to_result: true,
            group: 'map_cloning',
            input: '#minecraft:clonable_maps',
            material: 'minecraft:map',
            material_count: { max: 8, min: 1 },
            result: {}
        });

        expect(cloning).toMatchObject({
            materialCount: { min: 1, max: 8 },
            addMaterialCountToResult: true,
            result: { count: 1 }
        });
        expect(cloning.type === 'minecraft:crafting_transmute' && cloning.result.id).toBeUndefined();
    });

    it('reads minecraft:crafting_dye', () => {
        const recipe = parse('minecraft:leather_boots_dyed', {
            type: 'minecraft:crafting_dye',
            dye: '#minecraft:dyes',
            group: 'dyed_armor',
            result: { id: 'minecraft:leather_boots' },
            target: 'minecraft:leather_boots'
        });

        expect(recipe.type === 'minecraft:crafting_dye' && recipe.dye.items).toEqual([
            'minecraft:red_dye',
            'minecraft:blue_dye'
        ]);
    });

    it('reads minecraft:crafting_imbue', () => {
        const recipe = parse('minecraft:tipped_arrow', {
            type: 'minecraft:crafting_imbue',
            material: 'minecraft:arrow',
            result: { count: 8, id: 'minecraft:tipped_arrow' },
            source: 'minecraft:lingering_potion'
        });

        expect(recipe).toMatchObject({ type: 'minecraft:crafting_imbue', result: { count: 8 } });
    });

    it('reads minecraft:crafting_decorated_pot', () => {
        const recipe = parse('minecraft:decorated_pot', {
            type: 'minecraft:crafting_decorated_pot',
            back: '#minecraft:decorated_pot_ingredients',
            front: '#minecraft:decorated_pot_ingredients',
            left: '#minecraft:decorated_pot_ingredients',
            right: '#minecraft:decorated_pot_ingredients',
            result: { id: 'minecraft:decorated_pot' }
        });

        expect(recipeIngredients(recipe)).toHaveLength(4);
    });

    it.each([
        ['minecraft:smelting', 'smelting'],
        ['minecraft:blasting', 'blasting'],
        ['minecraft:smoking', 'smoking'],
        ['minecraft:campfire_cooking', 'campfire_cooking']
    ])('reads %s at the %s station', (type, station) => {
        const recipe = parse('minecraft:baked_potato', {
            type,
            category: 'food',
            cookingtime: 600,
            experience: 0.35,
            ingredient: 'minecraft:potato',
            result: { id: 'minecraft:baked_potato' }
        });

        expect(recipe).toMatchObject({ type, station, experience: 0.35, cookingTime: 600 });
    });

    it('reads minecraft:stonecutting', () => {
        const recipe = parse('minecraft:andesite_slab_from_andesite_stonecutting', {
            type: 'minecraft:stonecutting',
            ingredient: 'minecraft:andesite',
            result: { count: 2, id: 'minecraft:andesite_slab' }
        });

        expect(recipe).toMatchObject({ station: 'stonecutting', result: { count: 2 } });
    });

    it('reads minecraft:smithing_transform', () => {
        const recipe = parse('minecraft:netherite_axe_smithing', {
            type: 'minecraft:smithing_transform',
            addition: '#minecraft:netherite_tool_materials',
            base: 'minecraft:diamond_axe',
            result: { id: 'minecraft:netherite_axe' },
            template: 'minecraft:netherite_upgrade_smithing_template'
        });

        expect(recipe).toMatchObject({ station: 'smithing' });
        expect(recipeIngredients(recipe).map((cell) => cell?.items)).toEqual([
            ['minecraft:netherite_upgrade_smithing_template'],
            ['minecraft:diamond_axe'],
            ['minecraft:netherite_ingot']
        ]);
    });

    it('reads minecraft:smithing_trim and keeps its trim pattern', () => {
        const recipe = parse('minecraft:bolt_armor_trim_smithing_template_smithing_trim', {
            type: 'minecraft:smithing_trim',
            addition: '#minecraft:trim_materials',
            base: '#minecraft:trimmable_armor',
            pattern: 'minecraft:bolt',
            template: 'minecraft:bolt_armor_trim_smithing_template'
        });

        expect(recipe.type === 'minecraft:smithing_trim' && recipe.pattern).toBe('minecraft:bolt');
    });

    it('reads minecraft:brewing with its inline potion predicate', () => {
        const recipe = parse('minecraft:brewing/lingering_potion_awkward_blaze_powder', {
            type: 'minecraft:brewing',
            input: { item: 'minecraft:lingering_potion', potion_contents: { potions: 'minecraft:awkward' } },
            output: {
                components: { 'minecraft:potion_contents': { potion: 'minecraft:strength' } },
                id: 'minecraft:lingering_potion'
            },
            reagent: { item: 'minecraft:blaze_powder' }
        });

        expect(recipe).toMatchObject({ station: 'brewing' });
        expect(recipe.type === 'minecraft:brewing' && recipe.input.components[0]?.potions).toEqual([
            'minecraft:awkward'
        ]);
    });

    it('reads minecraft:crafting_special_bannerduplicate', () => {
        const recipe = parse('minecraft:black_banner_duplicate', {
            type: 'minecraft:crafting_special_bannerduplicate',
            banner: 'minecraft:black_banner',
            result: { id: 'minecraft:black_banner' }
        });

        expect(recipe.type === 'minecraft:crafting_special_bannerduplicate' && recipe.banner.items).toEqual([
            'minecraft:black_banner'
        ]);
    });

    it('reads minecraft:crafting_special_bookcloning with its generation range', () => {
        const recipe = parse('minecraft:book_cloning', {
            type: 'minecraft:crafting_special_bookcloning',
            material: '#minecraft:book_cloning_target',
            result: { id: 'minecraft:written_book' },
            source: 'minecraft:written_book'
        });

        expect(recipe).toMatchObject({ allowedGenerations: { min: 0, max: 1 } });
    });

    it('clamps a book generation range that exceeds Java 0..2', () => {
        const { recipe, diagnostics } = parseRecipe(
            'test:book',
            {
                type: 'minecraft:crafting_special_bookcloning',
                material: 'minecraft:writable_book',
                result: { id: 'minecraft:written_book' },
                source: 'minecraft:written_book',
                allowed_generations: { min: 0, max: 9 }
            },
            tags
        );

        expect(recipe).toMatchObject({ allowedGenerations: { min: 0, max: 2 } });
        expect(diagnostics[0]?.severity).toBe('warning');
    });

    it('reads minecraft:crafting_special_firework_rocket', () => {
        const recipe = parse('minecraft:firework_rocket', {
            type: 'minecraft:crafting_special_firework_rocket',
            fuel: 'minecraft:gunpowder',
            result: { count: 3, id: 'minecraft:firework_rocket' },
            shell: 'minecraft:paper',
            star: 'minecraft:firework_star'
        });

        expect(recipe).toMatchObject({ result: { count: 3 } });
    });

    it('reads minecraft:crafting_special_firework_star and its shape table', () => {
        const recipe = parse('minecraft:firework_star', {
            type: 'minecraft:crafting_special_firework_star',
            dye: '#minecraft:dyes',
            fuel: 'minecraft:gunpowder',
            result: { id: 'minecraft:firework_star' },
            shapes: {
                burst: 'minecraft:feather',
                creeper: '#minecraft:skulls',
                large_ball: 'minecraft:fire_charge',
                star: 'minecraft:gold_nugget'
            },
            trail: 'minecraft:diamond',
            twinkle: 'minecraft:glowstone_dust'
        });

        expect(recipe.type === 'minecraft:crafting_special_firework_star' && Object.keys(recipe.shapes)).toEqual([
            'burst',
            'creeper',
            'large_ball',
            'star'
        ]);
    });

    it('reads minecraft:crafting_special_firework_star_fade', () => {
        const recipe = parse('minecraft:firework_star_fade', {
            type: 'minecraft:crafting_special_firework_star_fade',
            dye: '#minecraft:dyes',
            result: { id: 'minecraft:firework_star' },
            target: 'minecraft:firework_star'
        });

        expect(recipe.type).toBe('minecraft:crafting_special_firework_star_fade');
    });

    it('reads minecraft:crafting_special_mapextending with its derived result', () => {
        const recipe = parse('minecraft:map_extending', {
            type: 'minecraft:crafting_special_mapextending',
            map: '#minecraft:extendable_maps',
            material: 'minecraft:paper',
            result: {}
        });

        expect(recipe.type === 'minecraft:crafting_special_mapextending' && recipe.result.id).toBeUndefined();
    });

    it('reads the bare minecraft:crafting_special_repairitem stub', () => {
        const recipe = parse('minecraft:repair_item', { type: 'minecraft:crafting_special_repairitem' });

        expect(recipe).toEqual({
            id: 'minecraft:repair_item',
            type: 'minecraft:crafting_special_repairitem',
            station: 'crafting'
        });
    });

    it('reads minecraft:crafting_special_shielddecoration', () => {
        const recipe = parse('minecraft:shield_decoration', {
            type: 'minecraft:crafting_special_shielddecoration',
            banner: '#minecraft:banners',
            result: { id: 'minecraft:shield' },
            target: 'minecraft:shield'
        });

        expect(recipe.type === 'minecraft:crafting_special_shielddecoration' && recipe.target.items).toEqual([
            'minecraft:shield'
        ]);
    });

    it('covers all 22 serializers', () => {
        expect(RECIPE_TYPES).toHaveLength(22);
        expect(RECIPE_TYPES.filter((type) => type.startsWith('minecraft:crafting_special_'))).toHaveLength(8);
    });
});

describe('parseRecipe diagnostics', () => {
    it('rejects an unknown serializer without throwing', () => {
        const { recipe, diagnostics } = parseRecipe('test:thing', { type: 'minecraft:crafting_special_mapcloning' });

        expect(recipe).toBeUndefined();
        expect(diagnostics[0]?.message).toContain('is not a Java 26.3 recipe serializer');
    });

    it('rejects a pattern symbol the key never defines', () => {
        const { recipe, diagnostics } = parseRecipe('test:thing', {
            type: 'minecraft:crafting_shaped',
            key: { '#': 'minecraft:stick' },
            pattern: ['#X'],
            result: { id: 'minecraft:stick' }
        });

        expect(recipe).toBeUndefined();
        expect(diagnostics.some((diagnostic) => diagnostic.message.includes('which the key does not define'))).toBe(
            true
        );
    });

    it('rejects pattern rows of unequal length', () => {
        const { recipe } = parseRecipe('test:thing', {
            type: 'minecraft:crafting_shaped',
            key: { '#': 'minecraft:stick' },
            pattern: ['##', '#'],
            result: { id: 'minecraft:stick' }
        });

        expect(recipe).toBeUndefined();
    });

    it('warns about a key symbol the pattern never uses', () => {
        const { recipe, diagnostics } = parseRecipe('test:thing', {
            type: 'minecraft:crafting_shaped',
            key: { '#': 'minecraft:stick', X: 'minecraft:stone' },
            pattern: ['##'],
            result: { id: 'minecraft:stick' }
        });

        expect(recipe).toBeDefined();
        expect(diagnostics).toEqual([
            {
                severity: 'warning',
                recipeId: 'test:thing',
                path: 'key',
                message: 'the key defines the symbol X, which the pattern never uses'
            }
        ]);
    });

    it('rejects a non-object file and a missing type', () => {
        expect(parseRecipe('test:thing', 'nope').recipe).toBeUndefined();
        expect(parseRecipe('test:thing', {}).recipe).toBeUndefined();
    });
});
