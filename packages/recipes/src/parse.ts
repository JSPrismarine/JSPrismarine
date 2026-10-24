import type { Ingredient, TagLookup } from './ingredient';
import { parseIngredient } from './ingredient';
import type { IntRange, ItemStackTemplate } from './itemStack';
import { normalizeIdentifier } from './itemStack';
import type { Recipe, RecipeType, ShapedPattern } from './types';
import { RECIPE_TYPES, STATION_BY_TYPE } from './types';

/** One problem found while reading a recipe file. */
export interface RecipeDiagnostic {
    readonly severity: 'error' | 'warning';
    /** The recipe's identifier. */
    readonly recipeId: string;
    /** Dotted path to the offending field inside the recipe JSON. */
    readonly path: string;
    readonly message: string;
}

/**
 * What {@link parseRecipe} produced. `recipe` is absent exactly when the
 * diagnostics hold an error; warnings leave a usable recipe behind.
 */
export interface RecipeParseResult {
    readonly recipe?: Recipe;
    readonly diagnostics: readonly RecipeDiagnostic[];
}

const RECIPE_TYPE_SET: ReadonlySet<string> = new Set(RECIPE_TYPES);

const isRecipeType = (value: string): value is RecipeType => RECIPE_TYPE_SET.has(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is readonly string[] =>
    Array.isArray(value) && value.every((entry) => typeof entry === 'string');

/** Java caps a transmute recipe's `material_count` at this range. */
const TRANSMUTE_MATERIAL_COUNT_LIMIT: IntRange = { min: 1, max: 8 };
/** Java caps a book cloning recipe's `allowed_generations` at this range. */
const BOOK_GENERATION_LIMIT: IntRange = { min: 0, max: 2 };

/** Collects diagnostics while reading one recipe file. */
class RecipeReader {
    public readonly diagnostics: RecipeDiagnostic[] = [];

    public constructor(
        private readonly recipeId: string,
        private readonly source: Record<string, unknown>,
        private readonly tags: TagLookup | undefined
    ) {}

    public get failed(): boolean {
        return this.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
    }

    public error(path: string, message: string): undefined {
        this.diagnostics.push({ severity: 'error', recipeId: this.recipeId, path, message });
        return undefined;
    }

    public warn(path: string, message: string): void {
        this.diagnostics.push({ severity: 'warning', recipeId: this.recipeId, path, message });
    }

    public raw(field: string): unknown {
        return this.source[field];
    }

    public ingredient(field: string): Ingredient | undefined {
        return this.ingredientFrom(this.source[field], field);
    }

    public optionalIngredient(field: string): Ingredient | undefined {
        if (this.source[field] === undefined) return undefined;
        return this.ingredient(field);
    }

    public ingredientFrom(value: unknown, path: string): Ingredient | undefined {
        if (value === undefined) return this.error(path, 'the recipe is missing this ingredient');
        const result = parseIngredient(value, path, this.tags);
        for (const diagnostic of result.diagnostics) this.diagnostics.push({ ...diagnostic, recipeId: this.recipeId });
        return result.ingredient;
    }

    public text(field: string): string | undefined {
        const value = this.source[field];
        if (typeof value === 'string') return value;
        return this.error(field, `expected a string, got ${typeof value}`);
    }

    public optionalText(field: string): string | undefined {
        const value = this.source[field];
        if (value === undefined) return undefined;
        if (typeof value === 'string') return value;
        this.warn(field, `expected a string, got ${typeof value}; the field is ignored`);
        return undefined;
    }

    public number(field: string, fallback: number): number {
        const value = this.source[field];
        if (value === undefined) return fallback;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        this.warn(field, `expected a number, got ${typeof value}; using ${fallback}`);
        return fallback;
    }

    public flag(field: string, fallback: boolean): boolean {
        const value = this.source[field];
        if (value === undefined) return fallback;
        if (typeof value === 'boolean') return value;
        this.warn(field, `expected a boolean, got ${typeof value}; using ${fallback}`);
        return fallback;
    }

    /** Reads Java's `MinMaxBounds.Ints`, which is an exact number or an object with `min` and `max`. */
    public range(field: string, fallback: IntRange, limit: IntRange): IntRange {
        const value = this.source[field];
        if (value === undefined) return fallback;
        const bounds =
            typeof value === 'number'
                ? { min: value, max: value }
                : isRecord(value)
                  ? {
                        min: typeof value['min'] === 'number' ? value['min'] : limit.min,
                        max: typeof value['max'] === 'number' ? value['max'] : limit.max
                    }
                  : undefined;
        if (bounds === undefined) {
            this.warn(field, `expected a number or a {min, max} object, got ${typeof value}`);
            return fallback;
        }
        if (bounds.min < limit.min || bounds.max > limit.max) {
            this.warn(field, `${bounds.min}..${bounds.max} is outside Java's ${limit.min}..${limit.max}; clamped`);
            return { min: Math.max(bounds.min, limit.min), max: Math.min(bounds.max, limit.max) };
        }
        return bounds;
    }

    /** Reads a result stack. `id` is optional because map cloning and map extending derive theirs from the input. */
    public result(field: string): ItemStackTemplate | undefined {
        const value = this.source[field];
        if (typeof value === 'string') return { id: normalizeIdentifier(value), count: 1 };
        if (!isRecord(value)) return this.error(field, `expected a result object, got ${typeof value}`);
        const id = value['id'];
        if (id !== undefined && typeof id !== 'string') return this.error(`${field}.id`, 'expected an identifier');
        const count = value['count'];
        if (count !== undefined && typeof count !== 'number') return this.error(`${field}.count`, 'expected a number');
        const components = value['components'];
        if (components !== undefined && !isRecord(components))
            return this.error(`${field}.components`, 'expected an object');
        return {
            ...(typeof id === 'string' ? { id: normalizeIdentifier(id) } : {}),
            count: typeof count === 'number' ? count : 1,
            ...(components !== undefined ? { components } : {})
        };
    }

    /** Reads the shaped `pattern` and `key` pair into a row-major cell grid. */
    public pattern(): ShapedPattern | undefined {
        const rows = this.source['pattern'];
        if (!isStringArray(rows)) return this.error('pattern', 'expected a list of row strings');
        const first = rows[0];
        if (first === undefined) return this.error('pattern', 'a pattern needs at least one row');
        const width = first.length;
        if (width === 0) return this.error('pattern', 'a pattern row cannot be empty');
        if (rows.some((row) => row.length !== width))
            return this.error('pattern', 'every pattern row has to be the same length');

        const key = this.source['key'];
        if (!isRecord(key)) return this.error('key', 'expected an object mapping pattern symbols to ingredients');

        const ingredients = new Map<string, Ingredient>();
        for (const [symbol, value] of Object.entries(key)) {
            if (symbol === ' ') {
                this.error('key. ', 'the space symbol always means an empty slot and cannot be keyed');
                continue;
            }
            const ingredient = this.ingredientFrom(value, `key.${symbol}`);
            if (ingredient !== undefined) ingredients.set(symbol, ingredient);
        }

        const cells: (Ingredient | null)[] = [];
        for (const row of rows) {
            for (const symbol of row) {
                if (symbol === ' ') {
                    cells.push(null);
                    continue;
                }
                const ingredient = ingredients.get(symbol);
                if (ingredient === undefined) {
                    this.error('pattern', `the pattern uses the symbol ${symbol}, which the key does not define`);
                    cells.push(null);
                    continue;
                }
                cells.push(ingredient);
            }
        }
        for (const symbol of ingredients.keys())
            if (!rows.some((row) => row.includes(symbol)))
                this.warn('key', `the key defines the symbol ${symbol}, which the pattern never uses`);

        if (this.failed) return undefined;
        return { width, height: rows.length, cells };
    }
}

/**
 * Parses one Java recipe file into a {@link Recipe}. Handles all 22 of Java
 * 26.3's serializers; an unknown `type` is reported as an error rather than
 * throwing, because recipe files are untrusted input.
 *
 * Ingredient tags resolve through `tags` at parse time, which is where Java
 * resolves them too: a tag reload rebuilds the recipe set.
 *
 * @param id - The recipe's identifier, which is its datapack path without the extension.
 * @param source - The parsed recipe JSON.
 */
export const parseRecipe = (id: string, source: unknown, tags?: TagLookup): RecipeParseResult => {
    if (!isRecord(source))
        return {
            diagnostics: [
                { severity: 'error', recipeId: id, path: '', message: `expected a recipe object, got ${typeof source}` }
            ]
        };

    const rawType = source['type'];
    if (typeof rawType !== 'string')
        return { diagnostics: [{ severity: 'error', recipeId: id, path: 'type', message: 'expected a string' }] };
    const type = normalizeIdentifier(rawType);
    if (!isRecipeType(type))
        return {
            diagnostics: [
                {
                    severity: 'error',
                    recipeId: id,
                    path: 'type',
                    message: `${type} is not a Java 26.3 recipe serializer`
                }
            ]
        };

    const reader = new RecipeReader(id, source, tags);
    const group = reader.optionalText('group');
    const category = reader.optionalText('category');
    const base = {
        id,
        station: STATION_BY_TYPE[type],
        ...(group !== undefined ? { group } : {}),
        ...(category !== undefined ? { category } : {})
    };

    const build = (): Recipe | undefined => {
        switch (type) {
            case 'minecraft:crafting_shaped': {
                const pattern = reader.pattern();
                const result = reader.result('result');
                if (pattern === undefined || result === undefined) return undefined;
                return { ...base, type, pattern, result, showNotification: reader.flag('show_notification', true) };
            }
            case 'minecraft:crafting_shapeless': {
                const raw = reader.raw('ingredients');
                if (!Array.isArray(raw) || raw.length === 0)
                    return reader.error('ingredients', 'expected a non-empty ingredient list');
                const ingredients = raw.map((value, index) => reader.ingredientFrom(value, `ingredients[${index}]`));
                const result = reader.result('result');
                if (result === undefined || ingredients.some((ingredient) => ingredient === undefined))
                    return undefined;
                return { ...base, type, ingredients: ingredients.filter((i) => i !== undefined), result };
            }
            case 'minecraft:crafting_transmute': {
                const input = reader.ingredient('input');
                const material = reader.ingredient('material');
                const result = reader.result('result');
                if (input === undefined || material === undefined || result === undefined) return undefined;
                return {
                    ...base,
                    type,
                    input,
                    material,
                    materialCount: reader.range('material_count', { min: 1, max: 1 }, TRANSMUTE_MATERIAL_COUNT_LIMIT),
                    addMaterialCountToResult: reader.flag('add_material_count_to_result', false),
                    result
                };
            }
            case 'minecraft:crafting_dye': {
                const target = reader.ingredient('target');
                const dye = reader.ingredient('dye');
                const result = reader.result('result');
                if (target === undefined || dye === undefined || result === undefined) return undefined;
                return { ...base, type, target, dye, result };
            }
            case 'minecraft:crafting_imbue': {
                const imbueSource = reader.ingredient('source');
                const material = reader.ingredient('material');
                const result = reader.result('result');
                if (imbueSource === undefined || material === undefined || result === undefined) return undefined;
                return { ...base, type, source: imbueSource, material, result };
            }
            case 'minecraft:crafting_decorated_pot': {
                const back = reader.ingredient('back');
                const left = reader.ingredient('left');
                const right = reader.ingredient('right');
                const front = reader.ingredient('front');
                const result = reader.result('result');
                if (
                    back === undefined ||
                    left === undefined ||
                    right === undefined ||
                    front === undefined ||
                    result === undefined
                )
                    return undefined;
                return { ...base, type, back, left, right, front, result };
            }
            case 'minecraft:smelting':
            case 'minecraft:blasting':
            case 'minecraft:smoking':
            case 'minecraft:campfire_cooking': {
                const ingredient = reader.ingredient('ingredient');
                const result = reader.result('result');
                if (ingredient === undefined || result === undefined) return undefined;
                return {
                    ...base,
                    type,
                    ingredient,
                    result,
                    experience: reader.number('experience', 0),
                    cookingTime: reader.number('cookingtime', 200)
                };
            }
            case 'minecraft:stonecutting': {
                const ingredient = reader.ingredient('ingredient');
                const result = reader.result('result');
                if (ingredient === undefined || result === undefined) return undefined;
                return { ...base, type, ingredient, result };
            }
            case 'minecraft:smithing_transform': {
                const smithingBase = reader.ingredient('base');
                const result = reader.result('result');
                if (smithingBase === undefined || result === undefined) return undefined;
                const template = reader.optionalIngredient('template');
                const addition = reader.optionalIngredient('addition');
                return {
                    ...base,
                    type,
                    ...(template !== undefined ? { template } : {}),
                    base: smithingBase,
                    ...(addition !== undefined ? { addition } : {}),
                    result
                };
            }
            case 'minecraft:smithing_trim': {
                const smithingBase = reader.ingredient('base');
                const pattern = reader.text('pattern');
                if (smithingBase === undefined || pattern === undefined) return undefined;
                const template = reader.optionalIngredient('template');
                const addition = reader.optionalIngredient('addition');
                return {
                    ...base,
                    type,
                    ...(template !== undefined ? { template } : {}),
                    base: smithingBase,
                    ...(addition !== undefined ? { addition } : {}),
                    pattern: normalizeIdentifier(pattern)
                };
            }
            case 'minecraft:brewing': {
                const input = reader.ingredient('input');
                const reagent = reader.ingredient('reagent');
                const output = reader.result('output');
                if (input === undefined || reagent === undefined || output === undefined) return undefined;
                return { ...base, type, input, reagent, output };
            }
            case 'minecraft:crafting_special_bannerduplicate': {
                const banner = reader.ingredient('banner');
                const result = reader.result('result');
                if (banner === undefined || result === undefined) return undefined;
                return { ...base, type, banner, result };
            }
            case 'minecraft:crafting_special_bookcloning': {
                const cloneSource = reader.ingredient('source');
                const material = reader.ingredient('material');
                const result = reader.result('result');
                if (cloneSource === undefined || material === undefined || result === undefined) return undefined;
                return {
                    ...base,
                    type,
                    source: cloneSource,
                    material,
                    allowedGenerations: reader.range('allowed_generations', { min: 0, max: 1 }, BOOK_GENERATION_LIMIT),
                    result
                };
            }
            case 'minecraft:crafting_special_firework_rocket': {
                const shell = reader.ingredient('shell');
                const fuel = reader.ingredient('fuel');
                const star = reader.ingredient('star');
                const result = reader.result('result');
                if (shell === undefined || fuel === undefined || star === undefined || result === undefined)
                    return undefined;
                return { ...base, type, shell, fuel, star, result };
            }
            case 'minecraft:crafting_special_firework_star': {
                const fuel = reader.ingredient('fuel');
                const dye = reader.ingredient('dye');
                const trail = reader.ingredient('trail');
                const twinkle = reader.ingredient('twinkle');
                const result = reader.result('result');
                const rawShapes = reader.raw('shapes');
                if (!isRecord(rawShapes)) return reader.error('shapes', 'expected an object keyed by shape name');
                const shapes: Record<string, Ingredient> = {};
                for (const [shape, value] of Object.entries(rawShapes)) {
                    const ingredient = reader.ingredientFrom(value, `shapes.${shape}`);
                    if (ingredient !== undefined) shapes[shape] = ingredient;
                }
                if (
                    fuel === undefined ||
                    dye === undefined ||
                    trail === undefined ||
                    twinkle === undefined ||
                    result === undefined ||
                    reader.failed
                )
                    return undefined;
                return { ...base, type, fuel, dye, shapes, trail, twinkle, result };
            }
            case 'minecraft:crafting_special_firework_star_fade': {
                const target = reader.ingredient('target');
                const dye = reader.ingredient('dye');
                const result = reader.result('result');
                if (target === undefined || dye === undefined || result === undefined) return undefined;
                return { ...base, type, target, dye, result };
            }
            case 'minecraft:crafting_special_mapextending': {
                const map = reader.ingredient('map');
                const material = reader.ingredient('material');
                const result = reader.result('result');
                if (map === undefined || material === undefined || result === undefined) return undefined;
                return { ...base, type, map, material, result };
            }
            case 'minecraft:crafting_special_repairitem':
                return { ...base, type };
            case 'minecraft:crafting_special_shielddecoration': {
                const banner = reader.ingredient('banner');
                const target = reader.ingredient('target');
                const result = reader.result('result');
                if (banner === undefined || target === undefined || result === undefined) return undefined;
                return { ...base, type, banner, target, result };
            }
        }
    };

    const recipe = build();
    if (recipe === undefined || reader.failed) return { diagnostics: reader.diagnostics };
    return { recipe, diagnostics: reader.diagnostics };
};
