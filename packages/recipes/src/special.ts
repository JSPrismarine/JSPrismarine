import type { CraftOutcome } from './assemble';
import { buildResult, classifySlots, withComponents } from './assemble';
import type { RecipeContext } from './context';
import type { CroppedGrid } from './grid';
import { ingredientAccepts } from './ingredient';
import type { RecipeItemStack } from './itemStack';
import { rangeContains } from './itemStack';
import type {
    BannerDuplicateRecipe,
    BookCloningRecipe,
    DecoratedPotRecipe,
    DyeRecipe,
    FireworkRocketRecipe,
    FireworkStarFadeRecipe,
    FireworkStarRecipe,
    ImbueRecipe,
    MapExtendingRecipe,
    RepairItemRecipe,
    ShieldDecorationRecipe,
    TransmuteRecipe
} from './types';

/** The explosion shape a firework star records when no shape modifier is present. */
const DEFAULT_FIREWORK_SHAPE = 'small_ball';
/** The dye color a dye item falls back to, matching Java's `stack.getOrDefault(DYE, WHITE)`. */
const DEFAULT_DYE_COLOR = 'white';
/** The fraction of an item's durability that combining two of them in a crafting grid adds back. */
const REPAIR_BONUS_PERCENT = 5;
/** Decorated pot sherd slots inside the cropped 3x3 grid, in the order the result records them. */
const POT_SLOTS = { back: 1, left: 3, right: 5, front: 7 } as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const stackAt = (grid: CroppedGrid, slot: number): RecipeItemStack | null => grid.slots[slot] ?? null;

/** Reads a stack's `minecraft:dyed_color`, accepting the bare integer and the older object form. */
const dyedColorOf = (stack: RecipeItemStack): number | undefined => {
    const value = stack.components?.['minecraft:dyed_color'];
    if (typeof value === 'number') return value;
    if (isRecord(value) && typeof value['rgb'] === 'number') return value['rgb'];
    return undefined;
};

/** Reads the dye color name a dye item carries in `minecraft:dye`. */
const dyeNameOf = (stack: RecipeItemStack): string => {
    const value = stack.components?.['minecraft:dye'];
    return typeof value === 'string' ? value : DEFAULT_DYE_COLOR;
};

/**
 * Averages dye colors the way Java's `DyedItemColor.applyDyes` does: average
 * each channel over the contributing colors, then scale the result back up so
 * its brightest channel equals the average of the inputs' brightest channels.
 */
const mixDyeColors = (existing: number | undefined, dyes: readonly number[]): number | undefined => {
    if (dyes.length === 0) return existing;
    let red = 0;
    let green = 0;
    let blue = 0;
    let brightestSum = 0;
    let count = 0;
    const add = (rgb: number): void => {
        const r = (rgb >> 16) & 0xff;
        const g = (rgb >> 8) & 0xff;
        const b = rgb & 0xff;
        brightestSum += Math.max(r, g, b);
        red += r;
        green += g;
        blue += b;
        count += 1;
    };
    if (existing !== undefined) add(existing);
    for (const dye of dyes) add(dye);

    red = Math.floor(red / count);
    green = Math.floor(green / count);
    blue = Math.floor(blue / count);
    const brightest = Math.max(red, green, blue);
    if (brightest > 0) {
        const target = brightestSum / count;
        red = Math.floor((red * target) / brightest);
        green = Math.floor((green * target) / brightest);
        blue = Math.floor((blue * target) / brightest);
    }
    return (red << 16) | (green << 8) | blue;
};

/** Resolves the dye colors of the stacks at the given slots through the injected color table. */
const dyeColorsAt = (grid: CroppedGrid, slots: readonly number[], context: RecipeContext): number[] => {
    const colors: number[] = [];
    for (const slot of slots) {
        const stack = stackAt(grid, slot);
        if (stack === null) continue;
        const color = context.dyeColorRgb?.(dyeNameOf(stack));
        if (color !== undefined) colors.push(color);
    }
    return colors;
};

/** A one-item copy of a stack, which is what a recipe puts back into a slot it does not consume. */
const singleCopy = (stack: RecipeItemStack): RecipeItemStack => ({
    id: stack.id,
    count: 1,
    ...(stack.components !== undefined ? { components: stack.components } : {})
});

/**
 * `minecraft:crafting_transmute`: one input keeps its components while its
 * identifier becomes the result's, paid for with a counted material.
 */
export const matchTransmute = (recipe: TransmuteRecipe, grid: CroppedGrid): CraftOutcome | undefined => {
    const roles = classifySlots(grid, [
        { ingredient: recipe.input, max: 1 },
        { ingredient: recipe.material, max: recipe.materialCount.max }
    ]);
    if (roles === undefined) return undefined;
    const [inputSlots = [], materialSlots = []] = roles;
    if (inputSlots.length !== 1 || !rangeContains(recipe.materialCount, materialSlots.length)) return undefined;

    const input = stackAt(grid, inputSlots[0] ?? -1);
    if (input === null) return undefined;
    const count = recipe.addMaterialCountToResult ? recipe.result.count + materialSlots.length : recipe.result.count;
    const result = buildResult(recipe.result, input, count);
    if (result === undefined) return undefined;
    return { result };
};

/** `minecraft:crafting_dye`: one dyeable target plus one to eight dyes, averaged into a new color. */
export const matchDye = (recipe: DyeRecipe, grid: CroppedGrid, context: RecipeContext): CraftOutcome | undefined => {
    const roles = classifySlots(grid, [
        { ingredient: recipe.target, max: 1 },
        { ingredient: recipe.dye, max: 8 }
    ]);
    if (roles === undefined) return undefined;
    const [targetSlots = [], dyeSlots = []] = roles;
    if (targetSlots.length !== 1 || dyeSlots.length === 0) return undefined;

    const target = stackAt(grid, targetSlots[0] ?? -1);
    if (target === null) return undefined;
    const base = buildResult(recipe.result, target);
    if (base === undefined) return undefined;
    const color = mixDyeColors(dyedColorOf(target), dyeColorsAt(grid, dyeSlots, context));
    return { result: color === undefined ? base : withComponents(base, { 'minecraft:dyed_color': color }) };
};

/** `minecraft:crafting_imbue`: eight materials around one source, which carries its potion into the result. */
export const matchImbue = (recipe: ImbueRecipe, grid: CroppedGrid): CraftOutcome | undefined => {
    if (grid.width !== 3 || grid.height !== 3 || grid.filled !== 9) return undefined;
    const source = stackAt(grid, 4);
    if (source === null) return undefined;
    const roles = classifySlots(grid, [
        { ingredient: recipe.source, max: 1 },
        { ingredient: recipe.material, max: 8 }
    ]);
    if (roles === undefined) return undefined;
    const [sourceSlots = []] = roles;
    if (sourceSlots.length !== 1 || sourceSlots[0] !== 4) return undefined;

    const result = buildResult(recipe.result);
    if (result === undefined) return undefined;
    const potion = source.components?.['minecraft:potion_contents'];
    return { result: potion === undefined ? result : withComponents(result, { 'minecraft:potion_contents': potion }) };
};

/** `minecraft:crafting_decorated_pot`: four sherds or bricks at the edge-center slots of a 3x3 grid. */
export const matchDecoratedPot = (recipe: DecoratedPotRecipe, grid: CroppedGrid): CraftOutcome | undefined => {
    if (grid.width !== 3 || grid.height !== 3 || grid.filled !== 4) return undefined;
    const sides = [
        [recipe.back, POT_SLOTS.back],
        [recipe.left, POT_SLOTS.left],
        [recipe.right, POT_SLOTS.right],
        [recipe.front, POT_SLOTS.front]
    ] as const;

    const decorations: string[] = [];
    for (const [ingredient, slot] of sides) {
        const stack = stackAt(grid, slot);
        if (!ingredientAccepts(ingredient, stack) || stack === null) return undefined;
        decorations.push(stack.id);
    }

    const result = buildResult(recipe.result);
    if (result === undefined) return undefined;
    return { result: withComponents(result, { 'minecraft:pot_decorations': decorations }) };
};

/** `minecraft:crafting_special_bannerduplicate`: a patterned banner and a blank one of the same color. */
export const matchBannerDuplicate = (recipe: BannerDuplicateRecipe, grid: CroppedGrid): CraftOutcome | undefined => {
    const roles = classifySlots(grid, [{ ingredient: recipe.banner, max: 2 }]);
    if (roles === undefined) return undefined;
    const [bannerSlots = []] = roles;
    if (bannerSlots.length !== 2) return undefined;

    const patterned = bannerSlots.filter((slot) => {
        const patterns = stackAt(grid, slot)?.components?.['minecraft:banner_patterns'];
        return Array.isArray(patterns) && patterns.length > 0;
    });
    if (patterned.length !== 1) return undefined;

    const sourceSlot = patterned[0] ?? -1;
    const source = stackAt(grid, sourceSlot);
    if (source === null) return undefined;
    const result = buildResult(recipe.result, source);
    if (result === undefined) return undefined;
    return { result, remainders: new Map([[sourceSlot, singleCopy(source)]]) };
};

/** `minecraft:crafting_special_bookcloning`: one written book plus blank books, one copy each. */
export const matchBookCloning = (recipe: BookCloningRecipe, grid: CroppedGrid): CraftOutcome | undefined => {
    const roles = classifySlots(grid, [{ ingredient: recipe.source, max: 1 }, { ingredient: recipe.material }]);
    if (roles === undefined) return undefined;
    const [sourceSlots = [], materialSlots = []] = roles;
    if (sourceSlots.length !== 1 || materialSlots.length === 0) return undefined;

    const sourceSlot = sourceSlots[0] ?? -1;
    const source = stackAt(grid, sourceSlot);
    if (source === null) return undefined;
    const content = source.components?.['minecraft:written_book_content'];
    if (!isRecord(content)) return undefined;
    const generation = typeof content['generation'] === 'number' ? content['generation'] : 0;
    if (!rangeContains(recipe.allowedGenerations, generation)) return undefined;

    const result = buildResult(recipe.result, source, materialSlots.length);
    if (result === undefined) return undefined;
    return {
        result: withComponents(result, {
            'minecraft:written_book_content': { ...content, generation: generation + 1 }
        }),
        remainders: new Map([[sourceSlot, singleCopy(source)]])
    };
};

/** `minecraft:crafting_special_firework_rocket`: one shell, one to three fuel, and up to seven stars. */
export const matchFireworkRocket = (recipe: FireworkRocketRecipe, grid: CroppedGrid): CraftOutcome | undefined => {
    if (grid.filled < 2) return undefined;
    const roles = classifySlots(grid, [
        { ingredient: recipe.shell, max: 1 },
        { ingredient: recipe.fuel, max: 3 },
        { ingredient: recipe.star }
    ]);
    if (roles === undefined) return undefined;
    const [shellSlots = [], fuelSlots = [], starSlots = []] = roles;
    if (shellSlots.length !== 1 || fuelSlots.length < 1) return undefined;

    const explosions = starSlots.flatMap((slot) => {
        const explosion = stackAt(grid, slot)?.components?.['minecraft:firework_explosion'];
        return explosion === undefined ? [] : [explosion];
    });
    const result = buildResult(recipe.result);
    if (result === undefined) return undefined;
    return {
        result: withComponents(result, {
            'minecraft:fireworks': { flight_duration: fuelSlots.length, explosions }
        })
    };
};

/** `minecraft:crafting_special_firework_star`: one fuel, one to eight dyes, and optional effect modifiers. */
export const matchFireworkStar = (
    recipe: FireworkStarRecipe,
    grid: CroppedGrid,
    context: RecipeContext
): CraftOutcome | undefined => {
    const shapeNames = Object.keys(recipe.shapes);
    const roles = [
        ...shapeNames.map((shape) => ({ ingredient: recipe.shapes[shape], max: 1 })),
        { ingredient: recipe.trail, max: 1 },
        { ingredient: recipe.twinkle, max: 1 },
        { ingredient: recipe.fuel, max: 1 },
        { ingredient: recipe.dye, max: 8 }
    ];
    const collected = classifySlots(grid, roles);
    if (collected === undefined) return undefined;

    const shapeHits = shapeNames.filter((_, index) => (collected[index]?.length ?? 0) > 0);
    if (shapeHits.length > 1) return undefined;
    const trailSlots = collected[shapeNames.length] ?? [];
    const twinkleSlots = collected[shapeNames.length + 1] ?? [];
    const fuelSlots = collected[shapeNames.length + 2] ?? [];
    const dyeSlots = collected[shapeNames.length + 3] ?? [];
    if (fuelSlots.length !== 1 || dyeSlots.length === 0) return undefined;

    const result = buildResult(recipe.result);
    if (result === undefined) return undefined;
    return {
        result: withComponents(result, {
            'minecraft:firework_explosion': {
                shape: shapeHits[0] ?? DEFAULT_FIREWORK_SHAPE,
                colors: dyeColorsAt(grid, dyeSlots, context),
                ...(trailSlots.length > 0 ? { has_trail: true } : {}),
                ...(twinkleSlots.length > 0 ? { has_twinkle: true } : {})
            }
        })
    };
};

/** `minecraft:crafting_special_firework_star_fade`: one firework star plus one to eight dyes. */
export const matchFireworkStarFade = (
    recipe: FireworkStarFadeRecipe,
    grid: CroppedGrid,
    context: RecipeContext
): CraftOutcome | undefined => {
    const roles = classifySlots(grid, [
        { ingredient: recipe.target, max: 1 },
        { ingredient: recipe.dye, max: 8 }
    ]);
    if (roles === undefined) return undefined;
    const [targetSlots = [], dyeSlots = []] = roles;
    if (targetSlots.length !== 1 || dyeSlots.length === 0) return undefined;

    const target = stackAt(grid, targetSlots[0] ?? -1);
    const explosion = target?.components?.['minecraft:firework_explosion'];
    if (target === null || !isRecord(explosion)) return undefined;

    const result = buildResult(recipe.result, target);
    if (result === undefined) return undefined;
    return {
        result: withComponents(result, {
            'minecraft:firework_explosion': {
                ...explosion,
                fade_colors: dyeColorsAt(grid, dyeSlots, context)
            }
        })
    };
};

/** `minecraft:crafting_special_mapextending`: a filled map centered in a 3x3 grid of paper. */
export const matchMapExtending = (recipe: MapExtendingRecipe, grid: CroppedGrid): CraftOutcome | undefined => {
    if (grid.width !== 3 || grid.height !== 3 || grid.filled !== 9) return undefined;
    const roles = classifySlots(grid, [
        { ingredient: recipe.map, max: 1 },
        { ingredient: recipe.material, max: 8 }
    ]);
    if (roles === undefined) return undefined;
    const [mapSlots = []] = roles;
    if (mapSlots.length !== 1 || mapSlots[0] !== 4) return undefined;

    const map = stackAt(grid, 4);
    if (map === null) return undefined;
    const result = buildResult(recipe.result, map, 1);
    if (result === undefined) return undefined;
    return { result: withComponents(result, { 'minecraft:map_post_processing': 'scale' }) };
};

/** Reads a stack's `minecraft:damage`, which is absent on an undamaged item. */
const damageOf = (stack: RecipeItemStack): number => {
    const value = stack.components?.['minecraft:damage'];
    return typeof value === 'number' ? value : 0;
};

/** Reads a stack's `minecraft:enchantments` levels table. */
const enchantmentsOf = (stack: RecipeItemStack): Record<string, number> => {
    const value = stack.components?.['minecraft:enchantments'];
    const levels = isRecord(value) && isRecord(value['levels']) ? value['levels'] : isRecord(value) ? value : {};
    const merged: Record<string, number> = {};
    for (const [id, level] of Object.entries(levels)) if (typeof level === 'number') merged[id] = level;
    return merged;
};

/**
 * `minecraft:crafting_special_repairitem`: two damaged copies of one
 * damageable item combine into one, with their remaining durability added
 * together plus five percent of the item's maximum.
 *
 * Needs `maxDamageOf`: damageability is what the recipe tests for, so
 * without the lookup it never matches.
 */
export const matchRepairItem = (
    _recipe: RepairItemRecipe,
    grid: CroppedGrid,
    context: RecipeContext
): CraftOutcome | undefined => {
    if (grid.filled !== 2 || context.maxDamageOf === undefined) return undefined;
    const stacks = grid.slots.filter((stack): stack is RecipeItemStack => stack !== null);
    const [first, second] = stacks;
    if (first === undefined || second === undefined) return undefined;
    if (first.id !== second.id || first.count !== 1 || second.count !== 1) return undefined;

    const maxDamage = context.maxDamageOf(first.id);
    if (maxDamage === undefined || maxDamage <= 0) return undefined;

    const durability =
        maxDamage -
        damageOf(first) +
        (maxDamage - damageOf(second)) +
        Math.floor((maxDamage * REPAIR_BONUS_PERCENT) / 100);
    const damage = Math.max(0, maxDamage - durability);

    const levels = enchantmentsOf(first);
    for (const [id, level] of Object.entries(enchantmentsOf(second))) levels[id] = Math.max(levels[id] ?? 0, level);

    return {
        result: {
            id: first.id,
            count: 1,
            components: {
                'minecraft:damage': damage,
                ...(Object.keys(levels).length > 0 ? { 'minecraft:enchantments': { levels } } : {})
            }
        }
    };
};

/** `minecraft:crafting_special_shielddecoration`: a shield takes a banner's base color and patterns. */
export const matchShieldDecoration = (recipe: ShieldDecorationRecipe, grid: CroppedGrid): CraftOutcome | undefined => {
    if (grid.filled !== 2) return undefined;
    const roles = classifySlots(grid, [
        { ingredient: recipe.banner, max: 1 },
        { ingredient: recipe.target, max: 1 }
    ]);
    if (roles === undefined) return undefined;
    const [bannerSlots = [], targetSlots = []] = roles;
    if (bannerSlots.length !== 1 || targetSlots.length !== 1) return undefined;

    const banner = stackAt(grid, bannerSlots[0] ?? -1);
    const target = stackAt(grid, targetSlots[0] ?? -1);
    if (banner === null || target === null) return undefined;
    if (target.components?.['minecraft:banner_patterns'] !== undefined) return undefined;

    const result = buildResult(recipe.result, target);
    if (result === undefined) return undefined;
    return {
        result: withComponents(result, {
            'minecraft:banner_patterns': banner.components?.['minecraft:banner_patterns'],
            'minecraft:base_color': banner.components?.['minecraft:base_color']
        })
    };
};
