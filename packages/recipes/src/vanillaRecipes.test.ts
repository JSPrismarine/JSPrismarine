import { javaItemToBedrock } from '@jsprismarine/mapping';
import { readZip } from '@jsprismarine/packs';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createRecipeBook } from './book';
import { compileRecipes } from './compile';
import type { RecipeContext } from './context';
import type { CraftingGrid } from './grid';
import type { Ingredient, TagLookup } from './ingredient';
import type { RecipeItemStack } from './itemStack';
import type { RecipeInput } from './match';
import { matchRecipe } from './match';
import { parseRecipe } from './parse';
import type { Recipe } from './types';
import { RECIPE_TYPES, STATION_BY_TYPE } from './types';

/**
 * Runs the whole package over Java 26.3's 2042 vanilla recipe files. Needs
 * the server jar that `pnpm --filter @jsprismarine/bedrock-data run
 * fetch:sources` caches, so it only runs with JSP_VANILLA_RECIPES set.
 */

const enabled = !!process.env.JSP_VANILLA_RECIPES;

const cacheRoot = join(import.meta.dirname, '..', '..', '..', 'node_modules', '.cache', 'jsprismarine');

const isSafePath = (path: string): boolean =>
    !path.startsWith('/') && !path.includes('\\') && path.split('/').every((segment) => segment !== '..');

/** Finds the cached Java server jar, whichever directory the fetch script put it in. */
const findServerJar = (): { readonly version: string; readonly path: string } => {
    for (const root of ['java', 'java-server']) {
        const base = join(cacheRoot, root);
        if (!existsSync(base)) continue;
        for (const version of readdirSync(base)) {
            const path = join(base, version, 'server.jar');
            if (existsSync(path)) return { version, path };
        }
    }
    throw new Error(`no server.jar under ${cacheRoot}; run the bedrock-data fetch:sources script`);
};

/** Extracts the vanilla recipe and tag JSON out of the bundler jar's inner server jar, once. */
const extractVanillaData = (): string => {
    const jar = findServerJar();
    const target = join(cacheRoot, 'vanilla-recipes', jar.version);
    const marker = join(target, '.extracted');
    if (existsSync(marker)) return target;

    const outer = readZip(readFileSync(jar.path));
    const innerName = [...outer.keys()].find((name) => /^META-INF\/versions\/[^/]+\/server-.+\.jar$/.test(name));
    if (innerName === undefined) throw new Error('the server jar has no META-INF/versions inner jar');

    for (const [name, bytes] of readZip(outer.get(innerName)!)) {
        if (!name.endsWith('.json') || !isSafePath(name)) continue;
        if (!name.startsWith('data/minecraft/recipe/') && !name.startsWith('data/minecraft/tags/')) continue;
        const absolute = join(target, ...name.split('/'));
        mkdirSync(dirname(absolute), { recursive: true });
        writeFileSync(absolute, bytes);
    }
    writeFileSync(marker, '');
    return target;
};

/** Every `.json` file under a directory, as repository-relative paths. */
const jsonFilesUnder = (root: string): readonly string[] => {
    if (!existsSync(root)) return [];
    return readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => join(entry.parentPath, entry.name));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads the vanilla tag files into a lookup that resolves nested `#tag` entries. */
const readTags = (root: string): TagLookup => {
    const raw = new Map<string, readonly unknown[]>();
    for (const registry of existsSync(join(root, 'data', 'minecraft', 'tags'))
        ? readdirSync(join(root, 'data', 'minecraft', 'tags'))
        : []) {
        const base = join(root, 'data', 'minecraft', 'tags', registry);
        for (const file of jsonFilesUnder(base)) {
            // Extracted game files are untrusted; every field is checked before use.
            const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
            if (!isRecord(parsed) || !Array.isArray(parsed['values'])) continue;
            const name = relative(base, file)
                .replace(/\.json$/, '')
                .split(/[/\\]/)
                .join('/');
            raw.set(`${registry} minecraft:${name}`, parsed['values']);
        }
    }

    const resolved = new Map<string, readonly string[]>();
    const resolve = (key: string, seen: ReadonlySet<string>): readonly string[] => {
        const cached = resolved.get(key);
        if (cached !== undefined) return cached;
        const values = raw.get(key);
        if (values === undefined || seen.has(key)) return [];
        const registry = key.split(' ')[0] ?? '';
        const members: string[] = [];
        for (const value of values) {
            const id =
                typeof value === 'string'
                    ? value
                    : isRecord(value) && typeof value['id'] === 'string'
                      ? value['id']
                      : undefined;
            if (id === undefined) continue;
            if (id.startsWith('#')) members.push(...resolve(`${registry} ${id.slice(1)}`, new Set([...seen, key])));
            else members.push(id);
        }
        const unique = [...new Set(members)];
        resolved.set(key, unique);
        return unique;
    };

    return (registry, tag) => {
        const key = `${registry} ${tag}`;
        return raw.has(key) ? resolve(key, new Set()) : undefined;
    };
};

const stack = (id: string, components?: Record<string, unknown>): RecipeItemStack => ({
    id,
    count: 1,
    ...(components !== undefined ? { components } : {})
});

const sample = (ingredient: Ingredient | null | undefined, components?: Record<string, unknown>) => {
    const id = ingredient?.items[0];
    return id === undefined ? null : stack(id, components);
};

const gridOf = (width: number, slots: readonly (RecipeItemStack | null)[]): CraftingGrid => ({
    width,
    height: Math.ceil(slots.length / width),
    slots
});

const WRITTEN_BOOK = { 'minecraft:written_book_content': { title: 'A', author: 'B', generation: 0 } };
const BANNER_PATTERNS = { 'minecraft:banner_patterns': [{ pattern: 'minecraft:stripe_top', color: 'white' }] };
const EXPLOSION = { 'minecraft:firework_explosion': { shape: 'small_ball', colors: [0xb02e26] } };

/**
 * Builds an input that should match the recipe, so the corpus can measure
 * how much of vanilla the matcher actually accepts. Returns `undefined`
 * where the recipe names no ingredient to build from, which is only
 * `repair_item`.
 */
const reconstruct = (recipe: Recipe): RecipeInput | undefined => {
    const craftingGrid = (width: number, slots: readonly (RecipeItemStack | null)[]): RecipeInput => ({
        station: 'crafting',
        grid: gridOf(width, slots)
    });

    switch (recipe.type) {
        case 'minecraft:crafting_shaped':
            return craftingGrid(
                recipe.pattern.width,
                recipe.pattern.cells.map((cell) => sample(cell))
            );
        case 'minecraft:crafting_shapeless':
            return craftingGrid(
                3,
                recipe.ingredients.map((ingredient) => sample(ingredient))
            );
        case 'minecraft:crafting_transmute':
            return craftingGrid(3, [
                sample(recipe.input),
                ...Array.from({ length: recipe.materialCount.min }, () => sample(recipe.material))
            ]);
        case 'minecraft:crafting_dye':
            return craftingGrid(2, [sample(recipe.target), sample(recipe.dye)]);
        case 'minecraft:crafting_imbue':
            return craftingGrid(
                3,
                Array.from({ length: 9 }, (_, slot) => (slot === 4 ? sample(recipe.source) : sample(recipe.material)))
            );
        case 'minecraft:crafting_decorated_pot':
            return craftingGrid(3, [
                null,
                sample(recipe.back),
                null,
                sample(recipe.left),
                null,
                sample(recipe.right),
                null,
                sample(recipe.front),
                null
            ]);
        case 'minecraft:crafting_special_bannerduplicate':
            return craftingGrid(2, [sample(recipe.banner, BANNER_PATTERNS), sample(recipe.banner)]);
        case 'minecraft:crafting_special_bookcloning':
            return craftingGrid(2, [sample(recipe.source, WRITTEN_BOOK), sample(recipe.material)]);
        case 'minecraft:crafting_special_firework_rocket':
            return craftingGrid(2, [sample(recipe.shell), sample(recipe.fuel)]);
        case 'minecraft:crafting_special_firework_star':
            return craftingGrid(2, [sample(recipe.fuel), sample(recipe.dye, { 'minecraft:dye': 'red' })]);
        case 'minecraft:crafting_special_firework_star_fade':
            return craftingGrid(2, [sample(recipe.target, EXPLOSION), sample(recipe.dye, { 'minecraft:dye': 'red' })]);
        case 'minecraft:crafting_special_mapextending':
            return craftingGrid(
                3,
                Array.from({ length: 9 }, (_, slot) => (slot === 4 ? sample(recipe.map) : sample(recipe.material)))
            );
        case 'minecraft:crafting_special_shielddecoration':
            return craftingGrid(2, [sample(recipe.banner, BANNER_PATTERNS), sample(recipe.target)]);
        case 'minecraft:crafting_special_repairitem':
            return undefined;
        case 'minecraft:smelting':
        case 'minecraft:blasting':
        case 'minecraft:smoking':
        case 'minecraft:campfire_cooking':
        case 'minecraft:stonecutting':
            // Read off the type rather than the recipe's own `station`, which `RecipeBase`
            // types as any station at all.
            return { station: STATION_BY_TYPE[recipe.type], item: sample(recipe.ingredient) };
        case 'minecraft:smithing_transform':
        case 'minecraft:smithing_trim':
            return {
                station: 'smithing',
                template: sample(recipe.template),
                base: sample(recipe.base),
                addition: sample(recipe.addition)
            };
        case 'minecraft:brewing': {
            const potion = recipe.input.components.find(
                (predicate) => predicate.component === 'minecraft:potion_contents'
            )?.potions?.[0];
            return {
                station: 'brewing',
                input: sample(recipe.input, potion === undefined ? undefined : { 'minecraft:potion_contents': potion }),
                reagent: sample(recipe.reagent)
            };
        }
    }
};

describe.skipIf(!enabled)('the vanilla 26.3 recipe corpus', { tags: ['real-data'] }, () => {
    it('parses, matches and compiles all 2042 files', { timeout: 180_000 }, () => {
        const root = extractVanillaData();
        const recipeRoot = join(root, 'data', 'minecraft', 'recipe');
        const files = jsonFilesUnder(recipeRoot);
        const tags = readTags(root);
        const context: RecipeContext = { tags, dyeColorRgb: () => 0xb02e26 };

        const recipes: Recipe[] = [];
        const errors: string[] = [];
        for (const file of files) {
            const id = `minecraft:${relative(recipeRoot, file)
                .replace(/\.json$/, '')
                .split(/[/\\]/)
                .join('/')}`;
            // Extracted game files are untrusted; parseRecipe validates every field it reads.
            const source: unknown = JSON.parse(readFileSync(file, 'utf8'));
            const { recipe, diagnostics } = parseRecipe(id, source, tags);
            for (const diagnostic of diagnostics)
                if (diagnostic.severity === 'error')
                    errors.push(`${diagnostic.recipeId} ${diagnostic.path}: ${diagnostic.message}`);
            if (recipe !== undefined) recipes.push(recipe);
        }

        expect(files).toHaveLength(2042);
        expect(errors).toEqual([]);
        expect(recipes).toHaveLength(2042);
        expect(new Set(recipes.map((recipe) => recipe.type)).size).toBe(RECIPE_TYPES.length);

        const book = createRecipeBook(recipes, context);
        let reconstructed = 0;
        let matched = 0;
        let firstInBook = 0;
        const unmatched: string[] = [];
        for (const recipe of recipes) {
            const input = reconstruct(recipe);
            if (input === undefined) continue;
            reconstructed += 1;
            if (matchRecipe(recipe, input, context) === undefined) {
                unmatched.push(recipe.id);
                continue;
            }
            matched += 1;
            if (book.match(input)?.recipe.id === recipe.id) firstInBook += 1;
        }

        const report = compileRecipes(recipes, javaItemToBedrock);

        console.debug(
            [
                `recipes ${recipes.length}`,
                `serializers ${new Set(recipes.map((recipe) => recipe.type)).size}`,
                `reconstructed ${reconstructed}`,
                `matched ${matched}`,
                `first in book ${firstInBook}`,
                `unmatched ${unmatched.length}`,
                `compiled ${report.recipes.length}`,
                `losses ${report.losses.length}`,
                `gaps ${report.gaps.length}`,
                `dropped ${report.dropped.length}`
            ].join(', ')
        );

        // Only `repair_item` names no ingredient to rebuild an input from.
        expect(unmatched).toEqual([]);
        expect(reconstructed).toBe(2041);
        expect(matched).toBe(2041);

        // The remaining 272 rebuilt inputs match an earlier recipe first. Almost
        // all are stonecutting, where vanilla deliberately offers several results
        // per input and the player picks one at the station.
        expect(firstInBook).toBe(1769);

        expect(report.recipes).toHaveLength(2042);
        expect(report.dropped).toEqual([]);
        expect(report.gaps).toEqual([]);
        // Both losses are results Bedrock merges away, and both keep their recipe.
        expect(report.losses.map((loss) => `${loss.recipeId} ${loss.where} ${loss.javaId}`)).toEqual([
            'minecraft:furnace_minecart result minecraft:furnace_minecart',
            'minecraft:spectral_arrow result minecraft:spectral_arrow'
        ]);
    });
});
