import { describe, expect, it } from 'vitest';

import type { RecipeContext } from './context';
import type { CraftingGrid } from './grid';
import type { TagLookup } from './ingredient';
import type { RecipeItemStack } from './itemStack';
import { matchRecipe } from './match';
import { parseRecipe } from './parse';
import type { Recipe } from './types';

const tags: TagLookup = (registry, tag) => {
    if (registry !== 'item') return undefined;
    const table: Record<string, readonly string[]> = {
        'minecraft:banners': ['minecraft:white_banner', 'minecraft:red_banner'],
        'minecraft:book_cloning_target': ['minecraft:writable_book'],
        'minecraft:clonable_maps': ['minecraft:filled_map'],
        'minecraft:decorated_pot_ingredients': ['minecraft:brick', 'minecraft:angler_pottery_sherd'],
        'minecraft:dyes': ['minecraft:red_dye', 'minecraft:blue_dye'],
        'minecraft:extendable_maps': ['minecraft:filled_map'],
        'minecraft:shulker_boxes': ['minecraft:shulker_box'],
        'minecraft:skulls': ['minecraft:creeper_head']
    };
    return table[tag];
};

/** Java's `DyeColor` texture colors for the two dyes these cases use. */
const DYE_COLORS: Record<string, number> = { red: 0xb02e26, blue: 0x3c44aa };

const context: RecipeContext = {
    tags,
    dyeColorRgb: (color) => DYE_COLORS[color],
    maxDamageOf: (id) => (id === 'minecraft:iron_pickaxe' ? 250 : undefined)
};

const item = (id: string, components?: Record<string, unknown>, count = 1): RecipeItemStack => ({
    id,
    count,
    ...(components !== undefined ? { components } : {})
});

const dye = (color: string) => item(`minecraft:${color}_dye`, { 'minecraft:dye': color });

/** Lays stacks out in a grid of the given width, with `null` for an empty slot. */
const laidOut = (width: number, slots: readonly (RecipeItemStack | null)[]): CraftingGrid => ({
    width,
    height: Math.ceil(slots.length / width),
    slots
});

const recipeOf = (source: Record<string, unknown>): Recipe => {
    const { recipe, diagnostics } = parseRecipe('test:recipe', source, tags);
    expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    return recipe!;
};

const craft = (recipe: Recipe, grid: CraftingGrid) => matchRecipe(recipe, { station: 'crafting', grid }, context);

describe('minecraft:crafting_transmute', () => {
    const shulkerDye = recipeOf({
        type: 'minecraft:crafting_transmute',
        group: 'shulker_box_dye',
        input: '#minecraft:shulker_boxes',
        material: 'minecraft:black_dye',
        result: { id: 'minecraft:black_shulker_box' }
    });

    const mapCloning = recipeOf({
        type: 'minecraft:crafting_transmute',
        add_material_count_to_result: true,
        input: '#minecraft:clonable_maps',
        material: 'minecraft:map',
        material_count: { min: 1, max: 8 },
        result: {}
    });

    it('keeps the input components while changing its identifier', () => {
        const box = item('minecraft:shulker_box', { 'minecraft:container': [{ slot: 0, item: 'minecraft:stone' }] });

        expect(craft(shulkerDye, laidOut(2, [box, item('minecraft:black_dye')]))?.result).toEqual({
            id: 'minecraft:black_shulker_box',
            count: 1,
            components: { 'minecraft:container': [{ slot: 0, item: 'minecraft:stone' }] }
        });
    });

    it('rejects a material count outside the declared range', () => {
        expect(
            craft(
                shulkerDye,
                laidOut(3, [item('minecraft:shulker_box'), item('minecraft:black_dye'), item('minecraft:black_dye')])
            )
        ).toBeUndefined();
    });

    it('scales the result count by the material count when map cloning', () => {
        const map = item('minecraft:filled_map', { 'minecraft:map_id': 7 });
        const blanks = [item('minecraft:map'), item('minecraft:map'), item('minecraft:map')];

        expect(craft(mapCloning, laidOut(2, [map, ...blanks]))?.result).toEqual({
            id: 'minecraft:filled_map',
            count: 4,
            components: { 'minecraft:map_id': 7 }
        });
    });
});

describe('minecraft:crafting_dye', () => {
    const dyedBoots = recipeOf({
        type: 'minecraft:crafting_dye',
        dye: '#minecraft:dyes',
        group: 'dyed_armor',
        result: { id: 'minecraft:leather_boots' },
        target: 'minecraft:leather_boots'
    });

    it('takes one dye color straight through', () => {
        expect(craft(dyedBoots, laidOut(2, [item('minecraft:leather_boots'), dye('red')]))?.result).toEqual({
            id: 'minecraft:leather_boots',
            count: 1,
            components: { 'minecraft:dyed_color': 0xb02e26 }
        });
    });

    it('averages two dyes the way Java does', () => {
        const match = craft(dyedBoots, laidOut(3, [item('minecraft:leather_boots'), dye('red'), dye('blue')]));

        expect(match?.result.components?.['minecraft:dyed_color']).toBe(0xad5398);
    });

    it('needs a target and at least one dye', () => {
        expect(craft(dyedBoots, laidOut(1, [item('minecraft:leather_boots')]))).toBeUndefined();
        expect(craft(dyedBoots, laidOut(2, [dye('red'), dye('blue')]))).toBeUndefined();
    });
});

describe('minecraft:crafting_imbue', () => {
    const tippedArrow = recipeOf({
        type: 'minecraft:crafting_imbue',
        material: 'minecraft:arrow',
        result: { count: 8, id: 'minecraft:tipped_arrow' },
        source: 'minecraft:lingering_potion'
    });

    const potion = item('minecraft:lingering_potion', {
        'minecraft:potion_contents': { potion: 'minecraft:strength' }
    });

    it('carries the potion from the center slot into eight arrows', () => {
        const slots = Array.from({ length: 9 }, (_, slot) => (slot === 4 ? potion : item('minecraft:arrow')));

        expect(craft(tippedArrow, laidOut(3, slots))?.result).toEqual({
            id: 'minecraft:tipped_arrow',
            count: 8,
            components: { 'minecraft:potion_contents': { potion: 'minecraft:strength' } }
        });
    });

    it('rejects the potion anywhere but the center', () => {
        const slots = Array.from({ length: 9 }, (_, slot) => (slot === 0 ? potion : item('minecraft:arrow')));

        expect(craft(tippedArrow, laidOut(3, slots))).toBeUndefined();
    });
});

describe('minecraft:crafting_decorated_pot', () => {
    const pot = recipeOf({
        type: 'minecraft:crafting_decorated_pot',
        back: '#minecraft:decorated_pot_ingredients',
        front: '#minecraft:decorated_pot_ingredients',
        left: '#minecraft:decorated_pot_ingredients',
        right: '#minecraft:decorated_pot_ingredients',
        result: { id: 'minecraft:decorated_pot' }
    });

    it('records the four sherds in back, left, right, front order', () => {
        const brick = item('minecraft:brick');
        const sherd = item('minecraft:angler_pottery_sherd');
        const slots = [null, sherd, null, brick, null, brick, null, brick];

        expect(craft(pot, laidOut(3, [...slots, null]))?.result).toEqual({
            id: 'minecraft:decorated_pot',
            count: 1,
            components: {
                'minecraft:pot_decorations': [
                    'minecraft:angler_pottery_sherd',
                    'minecraft:brick',
                    'minecraft:brick',
                    'minecraft:brick'
                ]
            }
        });
    });

    it('rejects a filled corner', () => {
        const brick = item('minecraft:brick');
        const slots = [brick, brick, null, brick, null, brick, null, brick, null];

        expect(craft(pot, laidOut(3, slots))).toBeUndefined();
    });
});

describe('minecraft:crafting_special_bannerduplicate', () => {
    const duplicate = recipeOf({
        type: 'minecraft:crafting_special_bannerduplicate',
        banner: 'minecraft:red_banner',
        result: { id: 'minecraft:red_banner' }
    });

    const patterns = [{ pattern: 'minecraft:stripe_top', color: 'white' }];

    it('copies the patterns and returns the original banner', () => {
        const patterned = item('minecraft:red_banner', { 'minecraft:banner_patterns': patterns });
        const match = craft(duplicate, laidOut(2, [patterned, item('minecraft:red_banner')]));

        expect(match?.result).toEqual({
            id: 'minecraft:red_banner',
            count: 1,
            components: { 'minecraft:banner_patterns': patterns }
        });
        expect(match?.consumed).toEqual([1, 1]);
        expect(match?.remainder).toEqual([patterned, null]);
    });

    it('needs exactly one patterned banner', () => {
        const patterned = item('minecraft:red_banner', { 'minecraft:banner_patterns': patterns });

        expect(craft(duplicate, laidOut(2, [patterned, patterned]))).toBeUndefined();
        expect(
            craft(duplicate, laidOut(2, [item('minecraft:red_banner'), item('minecraft:red_banner')]))
        ).toBeUndefined();
    });
});

describe('minecraft:crafting_special_bookcloning', () => {
    const cloning = recipeOf({
        type: 'minecraft:crafting_special_bookcloning',
        material: '#minecraft:book_cloning_target',
        result: { id: 'minecraft:written_book' },
        source: 'minecraft:written_book'
    });

    const written = (generation: number) =>
        item('minecraft:written_book', {
            'minecraft:written_book_content': { title: 'Notes', author: 'Steve', generation }
        });

    it('makes one copy per blank book and bumps the generation', () => {
        const source = written(0);
        const match = craft(
            cloning,
            laidOut(3, [source, item('minecraft:writable_book'), item('minecraft:writable_book')])
        );

        expect(match?.result).toEqual({
            id: 'minecraft:written_book',
            count: 2,
            components: {
                'minecraft:written_book_content': { title: 'Notes', author: 'Steve', generation: 1 }
            }
        });
        expect(match?.remainder).toEqual([source, null, null]);
    });

    it('refuses a copy of a copy of a copy', () => {
        expect(craft(cloning, laidOut(2, [written(2), item('minecraft:writable_book')]))).toBeUndefined();
        expect(craft(cloning, laidOut(2, [written(1), item('minecraft:writable_book')]))).toBeDefined();
    });
});

describe('minecraft:crafting_special_firework_rocket', () => {
    const rocket = recipeOf({
        type: 'minecraft:crafting_special_firework_rocket',
        fuel: 'minecraft:gunpowder',
        result: { count: 3, id: 'minecraft:firework_rocket' },
        shell: 'minecraft:paper',
        star: 'minecraft:firework_star'
    });

    const explosion = { shape: 'large_ball', colors: [0xb02e26] };

    it('takes the flight duration from the gunpowder count and the explosions from the stars', () => {
        const star = item('minecraft:firework_star', { 'minecraft:firework_explosion': explosion });
        const match = craft(
            rocket,
            laidOut(2, [item('minecraft:paper'), item('minecraft:gunpowder'), item('minecraft:gunpowder'), star])
        );

        expect(match?.result).toEqual({
            id: 'minecraft:firework_rocket',
            count: 3,
            components: { 'minecraft:fireworks': { flight_duration: 2, explosions: [explosion] } }
        });
    });

    it('needs one shell and at most three fuel', () => {
        expect(craft(rocket, laidOut(2, [item('minecraft:gunpowder')]))).toBeUndefined();
        expect(
            craft(
                rocket,
                laidOut(3, [
                    item('minecraft:paper'),
                    item('minecraft:gunpowder'),
                    item('minecraft:gunpowder'),
                    item('minecraft:gunpowder'),
                    item('minecraft:gunpowder')
                ])
            )
        ).toBeUndefined();
    });
});

describe('minecraft:crafting_special_firework_star', () => {
    const star = recipeOf({
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

    it('defaults to a small ball with no modifiers', () => {
        expect(craft(star, laidOut(2, [item('minecraft:gunpowder'), dye('red')]))?.result).toEqual({
            id: 'minecraft:firework_star',
            count: 1,
            components: { 'minecraft:firework_explosion': { shape: 'small_ball', colors: [0xb02e26] } }
        });
    });

    it('reads the shape, trail and twinkle modifiers', () => {
        const match = craft(
            star,
            laidOut(3, [
                item('minecraft:gunpowder'),
                dye('red'),
                dye('blue'),
                item('minecraft:fire_charge'),
                item('minecraft:diamond'),
                item('minecraft:glowstone_dust')
            ])
        );

        expect(match?.result.components?.['minecraft:firework_explosion']).toEqual({
            shape: 'large_ball',
            colors: [0xb02e26, 0x3c44aa],
            has_trail: true,
            has_twinkle: true
        });
    });

    it('rejects two shape modifiers', () => {
        expect(
            craft(
                star,
                laidOut(2, [
                    item('minecraft:gunpowder'),
                    dye('red'),
                    item('minecraft:fire_charge'),
                    item('minecraft:feather')
                ])
            )
        ).toBeUndefined();
    });
});

describe('minecraft:crafting_special_firework_star_fade', () => {
    const fade = recipeOf({
        type: 'minecraft:crafting_special_firework_star_fade',
        dye: '#minecraft:dyes',
        result: { id: 'minecraft:firework_star' },
        target: 'minecraft:firework_star'
    });

    it('adds the fade colors to an existing explosion', () => {
        const star = item('minecraft:firework_star', {
            'minecraft:firework_explosion': { shape: 'star', colors: [0xb02e26] }
        });

        expect(craft(fade, laidOut(2, [star, dye('blue')]))?.result.components).toEqual({
            'minecraft:firework_explosion': { shape: 'star', colors: [0xb02e26], fade_colors: [0x3c44aa] }
        });
    });

    it('needs a star that already carries an explosion', () => {
        expect(craft(fade, laidOut(2, [item('minecraft:firework_star'), dye('blue')]))).toBeUndefined();
    });
});

describe('minecraft:crafting_special_mapextending', () => {
    const extending = recipeOf({
        type: 'minecraft:crafting_special_mapextending',
        map: '#minecraft:extendable_maps',
        material: 'minecraft:paper',
        result: {}
    });

    it('marks the centered map for rescaling', () => {
        const map = item('minecraft:filled_map', { 'minecraft:map_id': 3 });
        const slots = Array.from({ length: 9 }, (_, slot) => (slot === 4 ? map : item('minecraft:paper')));

        expect(craft(extending, laidOut(3, slots))?.result).toEqual({
            id: 'minecraft:filled_map',
            count: 1,
            components: { 'minecraft:map_id': 3, 'minecraft:map_post_processing': 'scale' }
        });
    });

    it('needs all eight paper slots filled', () => {
        const map = item('minecraft:filled_map', { 'minecraft:map_id': 3 });
        const slots = Array.from({ length: 9 }, (_, slot) =>
            slot === 4 ? map : slot === 0 ? null : item('minecraft:paper')
        );

        expect(craft(extending, laidOut(3, slots))).toBeUndefined();
    });
});

describe('minecraft:crafting_special_repairitem', () => {
    const repair = recipeOf({ type: 'minecraft:crafting_special_repairitem' });

    const pickaxe = (damage: number, enchantments?: Record<string, number>) =>
        item('minecraft:iron_pickaxe', {
            'minecraft:damage': damage,
            ...(enchantments !== undefined ? { 'minecraft:enchantments': { levels: enchantments } } : {})
        });

    it('adds the remaining durability of both items plus five percent', () => {
        expect(craft(repair, laidOut(2, [pickaxe(200), pickaxe(200)]))?.result).toEqual({
            id: 'minecraft:iron_pickaxe',
            count: 1,
            components: { 'minecraft:damage': 138 }
        });
    });

    it('keeps the higher level of every enchantment', () => {
        const match = craft(
            repair,
            laidOut(2, [
                pickaxe(200, { 'minecraft:efficiency': 2 }),
                pickaxe(200, { 'minecraft:efficiency': 3, 'minecraft:unbreaking': 1 })
            ])
        );

        expect(match?.result.components?.['minecraft:enchantments']).toEqual({
            levels: { 'minecraft:efficiency': 3, 'minecraft:unbreaking': 1 }
        });
    });

    it('refuses two different items and items that take no damage', () => {
        expect(craft(repair, laidOut(2, [pickaxe(10), item('minecraft:golden_pickaxe')]))).toBeUndefined();
        expect(craft(repair, laidOut(2, [item('minecraft:stone'), item('minecraft:stone')]))).toBeUndefined();
    });

    it('never matches without the max damage lookup', () => {
        expect(
            matchRecipe(repair, { station: 'crafting', grid: laidOut(2, [pickaxe(200), pickaxe(200)]) }, { tags })
        ).toBeUndefined();
    });
});

describe('minecraft:crafting_special_shielddecoration', () => {
    const decoration = recipeOf({
        type: 'minecraft:crafting_special_shielddecoration',
        banner: '#minecraft:banners',
        result: { id: 'minecraft:shield' },
        target: 'minecraft:shield'
    });

    const patterns = [{ pattern: 'minecraft:stripe_top', color: 'white' }];

    it('moves the banner color and patterns onto the shield', () => {
        const banner = item('minecraft:red_banner', {
            'minecraft:banner_patterns': patterns,
            'minecraft:base_color': 'red'
        });

        expect(craft(decoration, laidOut(2, [banner, item('minecraft:shield')]))?.result).toEqual({
            id: 'minecraft:shield',
            count: 1,
            components: { 'minecraft:banner_patterns': patterns, 'minecraft:base_color': 'red' }
        });
    });

    it('refuses a shield that already carries patterns', () => {
        const banner = item('minecraft:red_banner', { 'minecraft:banner_patterns': patterns });
        const shield = item('minecraft:shield', { 'minecraft:banner_patterns': patterns });

        expect(craft(decoration, laidOut(2, [banner, shield]))).toBeUndefined();
    });
});
