/**
 * Bedrock behavior pack recipes, restated as the Java recipe files the server's recipe book reads.
 *
 * The book is `@jsprismarine/recipes`, which reads Java's grammar and names Java items, because
 * the vanilla recipes come from the Java datapack. An addon's `recipes/*.json` is Bedrock's
 * grammar and names Bedrock items, so each one is rewritten here into the Java file that means
 * the same thing, with its items resolved to Java identifiers, and then loads beside the vanilla
 * ones. A custom item outside the `minecraft` namespace keeps its identifier both ways.
 *
 * What translates:
 *
 * - `minecraft:recipe_shaped` at a `crafting_table` becomes `minecraft:crafting_shaped`.
 * - `minecraft:recipe_shapeless` at a `crafting_table` becomes `minecraft:crafting_shapeless`,
 *   with an ingredient's `count` written out as that many ingredients, and at a `stonecutter`
 *   it becomes `minecraft:stonecutting`.
 * - `minecraft:recipe_furnace` becomes one cooking recipe per station its tags name: `furnace`,
 *   `blast_furnace`, `smoker`, and `campfire` or `soul_campfire`.
 * - `minecraft:recipe_smithing_transform` becomes `minecraft:smithing_transform`.
 * - `minecraft:recipe_smithing_trim` becomes one `minecraft:smithing_trim` per template.
 * - `minecraft:recipe_brewing_mix` becomes one `minecraft:brewing` recipe per potion container,
 *   and `minecraft:recipe_brewing_container` one per potion.
 * - `minecraft:recipe_material_reduction` has no Java form, since its outputs are Education
 *   Edition elements, and is returned as it is for the crafting packet to carry.
 *
 * A station tag no Java station matches, such as a custom block's, has nowhere to go and is
 * reported as a `recipe.unsupported` warning. An item, potion or trim pattern a Java recipe
 * cannot name is a `recipe.invalid` error, and that recipe is left out.
 *
 * A Bedrock `tag` ingredient accepts the items of that Bedrock item tag. A tag Bedrock does not
 * know becomes the Java item tag of the same name. A legacy item name is renamed through
 * Bedrock's alias table, and a pattern row shorter than the longest ends in empty cells, both as
 * Bedrock reads them. Mojang's vanilla Bedrock recipe files rely on all three, which is what the
 * `recipes.registry` parity row runs them through.
 */
import { legacy_item_aliases, legacy_item_aux_aliases } from '@jsprismarine/bedrock-data';
import type { Diagnostic } from '@jsprismarine/content';
import { bedrockIdentifierToJava, mappedJavaIdentifiers } from '@jsprismarine/mapping';
import type { Definition } from '@jsprismarine/packs';
import type { RecipeStation } from '@jsprismarine/recipes';

import { isRecord } from '../utils/isRecord';
import { javaItemIdOf, javaItemIdsOf } from './javaItemId';

/** One Bedrock recipe file, restated as a Java one. */
export interface TranslatedRecipe {
    /** The Java recipe identifier: the Bedrock one, plus the station when the file names several. */
    readonly id: string;
    /** The Java recipe file. */
    readonly data: Readonly<Record<string, unknown>>;
    /** The Bedrock file it came from, for diagnostics. */
    readonly source: Definition;
}

/**
 * A Bedrock material reduction recipe, which no Java recipe can say: the material reducer
 * breaks an item into Education Edition elements, items Java does not have. It stays in
 * Bedrock's own names.
 */
export interface MaterialReduction {
    readonly id: string;
    /** The item the reducer takes, with its data value. */
    readonly input: { readonly identifier: string; readonly data: number };
    /** What it breaks the item into, in the file's order. */
    readonly outputs: readonly { readonly identifier: string; readonly count: number }[];
    /** The Bedrock file it came from, for diagnostics. */
    readonly source: Definition;
}

/** Everything {@link javaRecipesFromBedrock} produced. */
export interface BedrockRecipeTranslation {
    /** The recipes restated as Java recipe files, for the recipe book. */
    readonly recipes: readonly TranslatedRecipe[];
    /** The material reduction recipes, which stay outside the book. */
    readonly materialReductions: readonly MaterialReduction[];
}

/** The Java station each Bedrock station tag puts a recipe in front of. */
const STATION_BY_TAG: Readonly<Record<string, RecipeStation>> = {
    crafting_table: 'crafting',
    furnace: 'smelting',
    blast_furnace: 'blasting',
    smoker: 'smoking',
    campfire: 'campfire_cooking',
    soul_campfire: 'campfire_cooking',
    stonecutter: 'stonecutting',
    smithing_table: 'smithing',
    brewing_stand: 'brewing'
};

/** The station tag of Bedrock's material reducer, an Education Edition block Java has no counterpart of. */
const MATERIAL_REDUCER_TAG = 'material_reducer';

/** The three potion containers, which a Bedrock brewing mix applies to alike. */
const POTION_CONTAINERS = ['minecraft:potion', 'minecraft:splash_potion', 'minecraft:lingering_potion'] as const;

/** What Java names a smithing template's trim pattern after: the template, less this suffix. */
const TRIM_TEMPLATE_SUFFIX = '_armor_trim_smithing_template';

/** The Java serializer of each cooking station. */
const COOKING_TYPE = {
    smelting: 'minecraft:smelting',
    blasting: 'minecraft:blasting',
    smoking: 'minecraft:smoking',
    campfire_cooking: 'minecraft:campfire_cooking'
} as const satisfies Partial<Record<RecipeStation, string>>;

const isCookingStation = (station: RecipeStation): station is keyof typeof COOKING_TYPE => station in COOKING_TYPE;

/**
 * The legacy data values that mean "any variant": Bedrock writes `-1` in recipe files and
 * `32767` on the wire.
 */
const ANY_DATA = new Set([-1, 32767]);

/** A Bedrock item reference: an item with an optional data value and count, or an item tag. */
type BedrockItemRef =
    | { readonly item: string; readonly data?: number; readonly count?: number }
    | { readonly tag: string; readonly count?: number };

/**
 * What translating one recipe found. An error leaves the recipe out; a warning names something
 * the recipe loads without.
 */
interface Findings {
    readonly errors: string[];
    readonly warnings: string[];
    /** The Bedrock item tag lookup the translation resolves `tag` ingredients through. */
    readonly bedrockItemTag: BedrockItemTagLookup;
}

/** The Bedrock items a Bedrock item tag holds, or undefined for a tag Bedrock does not know. */
export type BedrockItemTagLookup = (tag: string) => readonly string[] | undefined;

/**
 * Reads one Bedrock item reference: `"ns:item"`, `"ns:item:data"`, or an object with `item`
 * (plus `data` and `count`) or `tag`.
 */
const itemRefOf = (value: unknown, where: string, findings: Findings): BedrockItemRef | undefined => {
    const fail = (message: string): undefined => {
        findings.errors.push(`${where}: ${message}`);
        return undefined;
    };
    if (typeof value === 'string') {
        const parts = value.split(':');
        const last = parts.at(-1) ?? '';
        if (parts.length >= 3 && /^-?\d+$/.test(last)) {
            return { item: parts.slice(0, -1).join(':'), data: Number(last) };
        }
        return { item: value.includes(':') ? value : `minecraft:${value}` };
    }
    if (!isRecord(value)) return fail('expected an item reference');

    const count = value['count'];
    if (count !== undefined && (typeof count !== 'number' || !Number.isInteger(count) || count < 1)) {
        return fail('count must be a positive integer');
    }
    const tag = value['tag'];
    if (typeof tag === 'string') return { tag, ...(count === undefined ? {} : { count }) };

    const item = value['item'];
    if (typeof item !== 'string') return fail('expected an item or a tag');
    const data = value['data'];
    if (data !== undefined && (typeof data !== 'number' || !Number.isInteger(data))) {
        return fail('data must be an integer');
    }
    const named = itemRefOf(item, where, findings);
    if (named === undefined || !('item' in named)) return named;
    return {
        item: named.item,
        ...(data !== undefined ? { data } : named.data !== undefined ? { data: named.data } : {}),
        ...(count === undefined ? {} : { count })
    };
};

/**
 * The current Bedrock items a recipe's item name stands for. Recipe files, Mojang's own among
 * them, still write some items by a name from before the flattening, such as `minecraft:boat`
 * with data 4 for an acacia boat, and Bedrock's alias table renames those. A legacy name with no
 * data value stands for every item it was split into.
 */
const currentItemsOf = (item: string, data: number | undefined): { item: string; data?: number }[] => {
    // The table also lists names that are still items, such as `minecraft:dirt`, whose data 1
    // was coarse dirt before the split. Today that name means dirt alone.
    if (javaItemIdsOf(item).length > 0) return [{ item, ...(data === undefined ? {} : { data }) }];
    // The table keys its names in lower case, as Bedrock reads them: Mojang's own files still
    // write `minecraft:muttonRaw`.
    const legacy = item.toLowerCase();
    if (legacy !== item && javaItemIdsOf(legacy).length > 0) return currentItemsOf(legacy, data);
    const variants = legacy_item_aux_aliases[legacy];
    if (variants !== undefined) {
        if (data !== undefined && !ANY_DATA.has(data)) {
            const renamed = variants[String(data)];
            return renamed === undefined ? [{ item, data }] : [{ item: renamed }];
        }
        return [...new Set(Object.values(variants))].map((renamed) => ({ item: renamed }));
    }
    return [{ item: legacy_item_aliases[legacy] ?? item, ...(data === undefined ? {} : { data }) }];
};

/** A Java ingredient for one Bedrock reference: an item, a list of items, or a `#tag`. */
const javaIngredientOf = (ref: BedrockItemRef, where: string, findings: Findings): string | readonly string[] => {
    const ids = new Set<string>();
    if ('tag' in ref) {
        // The tag is Bedrock's, so Bedrock's members are what it means. Several Bedrock tags have
        // no Java tag of the same name, such as `minecraft:egg`, which Java calls `#minecraft:eggs`.
        const members = findings.bedrockItemTag(ref.tag);
        if (members === undefined) return `#${ref.tag}`;
        for (const member of members) for (const id of javaItemIdsOf(member)) ids.add(id);
        if (ids.size === 0) findings.errors.push(`${where}: no item in the tag ${ref.tag} has a Java item`);
        const list = [...ids];
        return list.length === 1 ? list[0]! : list;
    }
    for (const { item, data } of currentItemsOf(ref.item, ref.data)) {
        if (data !== undefined && !ANY_DATA.has(data)) {
            const id = javaItemIdOf(item, data);
            if (id !== undefined) ids.add(id);
        } else for (const id of javaItemIdsOf(item)) ids.add(id);
    }
    if (ids.size === 0) {
        const named = ref.data === undefined ? ref.item : `${ref.item} with data ${ref.data}`;
        findings.errors.push(`${where}: ${named} has no Java item`);
    }
    const list = [...ids];
    return list.length === 1 ? list[0]! : list;
};

/** {@link javaIngredientOf} over the reference at `value`. */
const ingredientAt = (value: unknown, where: string, findings: Findings): string | readonly string[] => {
    const ref = itemRefOf(value, where, findings);
    return ref === undefined ? [] : javaIngredientOf(ref, where, findings);
};

/** A Java result stack for a Bedrock `result` or `output`, which may also be a list of results. */
const javaResultOf = (value: unknown, where: string, findings: Findings): Record<string, unknown> => {
    let primary = value;
    if (Array.isArray(value)) {
        if (value.length === 0) findings.errors.push(`${where}: expected at least one result`);
        // Bedrock hands the extra results back beside the first; Java's result is one stack.
        if (value.length > 1) findings.warnings.push(`${where}: only the first of ${value.length} results is crafted`);
        primary = value[0];
    }
    const ref = itemRefOf(primary, where, findings);
    if (ref === undefined) return {};
    if ('tag' in ref) {
        findings.errors.push(`${where}: a result cannot be a tag`);
        return {};
    }
    const [current] = currentItemsOf(ref.item, ref.data ?? 0);
    const id = current === undefined ? undefined : javaItemIdOf(current.item, current.data ?? 0);
    if (id === undefined) findings.errors.push(`${where}: ${ref.item} has no Java item`);
    return { id, ...(ref.count !== undefined && ref.count !== 1 ? { count: ref.count } : {}) };
};

/** The Java stations a Bedrock recipe's `tags` name, in order and without repeats. */
const stationsOf = (body: Record<string, unknown>, findings: Findings): RecipeStation[] => {
    // A material reduction file writes its one tag as a plain string.
    const tags = typeof body['tags'] === 'string' ? [body['tags']] : body['tags'];
    if (!Array.isArray(tags)) {
        findings.errors.push('tags: expected a list of station tags');
        return [];
    }
    const stations: RecipeStation[] = [];
    for (const tag of tags) {
        const station = typeof tag === 'string' ? STATION_BY_TAG[tag] : undefined;
        if (station === undefined) findings.warnings.push(`tags: no Java station matches ${String(tag)}`);
        else if (!stations.includes(station)) stations.push(station);
    }
    return stations;
};

/** The fields every Java recipe file copies from the Bedrock one. */
const sharedFields = (body: Record<string, unknown>): Record<string, unknown> =>
    typeof body['group'] === 'string' ? { group: body['group'] } : {};

/**
 * The Java files one Bedrock recipe body becomes, keyed by what tells them apart: the station
 * (`from_<station>`) for a recipe several stations make, the container for a brewing mix, the
 * potion for a brewing container recipe, and the trim pattern for a smithing trim. Undefined for
 * a recipe type this does not read.
 */
const translateBody = (
    kind: string,
    body: Record<string, unknown>,
    findings: Findings
): ReadonlyMap<string, Record<string, unknown>> | undefined => {
    const files = new Map<string, Record<string, unknown>>();
    const unusable = (station: RecipeStation): void => {
        findings.warnings.push(`tags: a ${kind} recipe cannot be made at a ${station} station`);
    };

    switch (kind) {
        case 'minecraft:recipe_shaped': {
            const stations = stationsOf(body, findings);
            const rows = body['pattern'];
            const key = body['key'];
            if (!Array.isArray(rows) || rows.some((row) => typeof row !== 'string')) {
                findings.errors.push('pattern: expected a list of rows');
                return files;
            }
            // Bedrock reads a row shorter than the longest as ending in empty cells; Java wants
            // every row the same length.
            const width = Math.max(...rows.map((row: string) => row.length));
            const pattern = rows.map((row: string) => row.padEnd(width, ' '));
            if (!isRecord(key)) {
                findings.errors.push('key: expected an object');
                return files;
            }
            const javaKey = Object.fromEntries(
                Object.entries(key).map(([symbol, value]) => [symbol, ingredientAt(value, `key.${symbol}`, findings)])
            );
            const result = javaResultOf(body['result'], 'result', findings);
            for (const station of stations) {
                if (station !== 'crafting') unusable(station);
                else {
                    files.set(`from_${station}`, {
                        type: 'minecraft:crafting_shaped',
                        ...sharedFields(body),
                        pattern,
                        key: javaKey,
                        result
                    });
                }
            }
            return files;
        }
        case 'minecraft:recipe_shapeless': {
            const stations = stationsOf(body, findings);
            const listed = body['ingredients'];
            if (!Array.isArray(listed) || listed.length === 0) {
                findings.errors.push('ingredients: expected a non-empty list');
                return files;
            }
            // Bedrock's `count` on an ingredient asks for that many of it, each in a slot of its
            // own, which Java writes as the ingredient repeated.
            const ingredients = listed.flatMap((value, index) => {
                const where = `ingredients[${index}]`;
                const ref = itemRefOf(value, where, findings);
                if (ref === undefined) return [];
                const ingredient = javaIngredientOf(ref, where, findings);
                return Array.from({ length: ref.count ?? 1 }, () => ingredient);
            });
            const result = javaResultOf(body['result'], 'result', findings);
            for (const station of stations) {
                if (station === 'crafting') {
                    files.set(`from_${station}`, {
                        type: 'minecraft:crafting_shapeless',
                        ...sharedFields(body),
                        ingredients,
                        result
                    });
                } else if (station === 'stonecutting' && ingredients.length === 1) {
                    files.set(`from_${station}`, {
                        type: 'minecraft:stonecutting',
                        ...sharedFields(body),
                        ingredient: ingredients[0],
                        result
                    });
                } else unusable(station);
            }
            return files;
        }
        case 'minecraft:recipe_furnace': {
            const stations = stationsOf(body, findings);
            const ingredient = ingredientAt(body['input'], 'input', findings);
            const result = javaResultOf(body['output'], 'output', findings);
            for (const station of stations) {
                if (!isCookingStation(station)) unusable(station);
                else
                    files.set(`from_${station}`, {
                        type: COOKING_TYPE[station],
                        ...sharedFields(body),
                        ingredient,
                        result
                    });
            }
            return files;
        }
        case 'minecraft:recipe_smithing_transform': {
            const stations = stationsOf(body, findings);
            const file = {
                type: 'minecraft:smithing_transform',
                template: ingredientAt(body['template'], 'template', findings),
                base: ingredientAt(body['base'], 'base', findings),
                addition: ingredientAt(body['addition'], 'addition', findings),
                result: javaResultOf(body['result'], 'result', findings)
            };
            for (const station of stations) {
                if (station === 'smithing') files.set(`from_${station}`, file);
                else unusable(station);
            }
            return files;
        }
        case 'minecraft:recipe_smithing_trim': {
            const stations = stationsOf(body, findings);
            const base = ingredientAt(body['base'], 'base', findings);
            const addition = ingredientAt(body['addition'], 'addition', findings);
            // Java names the pattern a trim writes in the recipe, one recipe per template, where
            // Bedrock reads it off whichever template is in the slot. Java names each vanilla
            // pattern after its template, so the template's name is the pattern's.
            const templates = [ingredientAt(body['template'], 'template', findings)].flat();
            for (const template of templates) {
                if (template.startsWith('#')) {
                    findings.errors.push(`template: the tag ${template.slice(1)} names no items`);
                    continue;
                }
                if (!template.endsWith(TRIM_TEMPLATE_SUFFIX)) {
                    findings.errors.push(`template: ${template} is not named for a trim pattern`);
                    continue;
                }
                const pattern = template.slice(0, -TRIM_TEMPLATE_SUFFIX.length);
                if (!stations.includes('smithing')) continue;
                files.set(pattern.replace(/^.*:/, ''), {
                    type: 'minecraft:smithing_trim',
                    template,
                    base,
                    addition,
                    pattern
                });
            }
            for (const station of stations) if (station !== 'smithing') unusable(station);
            return files;
        }
        case 'minecraft:recipe_brewing_mix': {
            const stations = stationsOf(body, findings);
            const input = javaPotionAt(body['input'], 'input', findings);
            const output = javaPotionAt(body['output'], 'output', findings);
            const reagent = ingredientAt(body['reagent'], 'reagent', findings);
            for (const station of stations) if (station !== 'brewing') unusable(station);
            if (!stations.includes('brewing') || input === undefined || output === undefined) return files;
            // A Bedrock mix changes the potion in any of the three containers, where Java writes
            // one recipe per container.
            for (const container of POTION_CONTAINERS) {
                files.set(container.replace(/^.*:/, ''), brewingFile(container, input, reagent, container, output));
            }
            return files;
        }
        case 'minecraft:recipe_brewing_container': {
            const stations = stationsOf(body, findings);
            const from = javaResultOf(body['input'], 'input', findings)['id'];
            const to = javaResultOf(body['output'], 'output', findings)['id'];
            const reagent = ingredientAt(body['reagent'], 'reagent', findings);
            for (const station of stations) if (station !== 'brewing') unusable(station);
            if (!stations.includes('brewing') || typeof from !== 'string' || typeof to !== 'string') return files;
            // A Bedrock container recipe keeps whatever potion the bottle holds, where Java writes
            // one recipe per potion, as its 45 gunpowder recipes do.
            for (const potion of mappedJavaIdentifiers('potion')) {
                files.set(potion.replace(/^.*:/, ''), brewingFile(from, potion, reagent, to, potion));
            }
            return files;
        }
        default:
            return undefined;
    }
};

/** A Java `minecraft:brewing` file: one potion in one container, plus a reagent, makes another. */
const brewingFile = (
    inputContainer: string,
    inputPotion: string,
    reagent: string | readonly string[],
    outputContainer: string,
    outputPotion: string
): Record<string, unknown> => ({
    type: 'minecraft:brewing',
    input: { item: inputContainer, potion_contents: { potions: inputPotion } },
    reagent,
    output: { id: outputContainer, components: { 'minecraft:potion_contents': { potion: outputPotion } } }
});

/**
 * The Java potion a Bedrock brewing mix names as `minecraft:potion_type:<name>`, which is the
 * Bedrock potion `minecraft:<name>`.
 */
const javaPotionAt = (value: unknown, where: string, findings: Findings): string | undefined => {
    const named = typeof value === 'string' ? value : isRecord(value) ? value['item'] : undefined;
    const match = typeof named === 'string' ? /^([^:]+):potion_type:(.+)$/.exec(named) : null;
    if (match === null) {
        findings.errors.push(`${where}: expected a potion written as <namespace>:potion_type:<name>`);
        return undefined;
    }
    // Bedrock reads the name in any case; Mojang's own files write `minecraft:potion_type:Thick`.
    const bedrock = `${match[1]}:${match[2]}`.toLowerCase();
    const java = bedrockIdentifierToJava('potion', bedrock);
    if (java === undefined) findings.errors.push(`${where}: the potion ${bedrock} has no Java potion`);
    return java;
};

/** Reads a material reduction body, in Bedrock's own item names. */
const materialReductionOf = (
    body: Record<string, unknown>,
    findings: Findings
): Omit<MaterialReduction, 'id' | 'source'> | undefined => {
    const tags = typeof body['tags'] === 'string' ? [body['tags']] : body['tags'];
    if (!Array.isArray(tags) || !tags.includes(MATERIAL_REDUCER_TAG)) {
        findings.warnings.push(`tags: a material reduction recipe is made at the ${MATERIAL_REDUCER_TAG} alone`);
        return undefined;
    }
    const input = itemRefOf(body['input'], 'input', findings);
    if (input === undefined) return undefined;
    if ('tag' in input) {
        findings.errors.push('input: a material reducer takes an item, not a tag');
        return undefined;
    }
    const [current] = currentItemsOf(input.item, input.data);
    const listed = Array.isArray(body['output']) ? body['output'] : [body['output']];
    const outputs: { identifier: string; count: number }[] = [];
    for (const [index, value] of listed.entries()) {
        const ref = itemRefOf(value, `output[${index}]`, findings);
        if (ref === undefined) continue;
        if ('tag' in ref) findings.errors.push(`output[${index}]: an output cannot be a tag`);
        else
            outputs.push({
                identifier: currentItemsOf(ref.item, ref.data)[0]?.item ?? ref.item,
                count: ref.count ?? 1
            });
    }
    if (outputs.length === 0) findings.errors.push('output: expected at least one output');
    return {
        input: { identifier: current?.item ?? input.item, data: current?.data ?? input.data ?? 0 },
        outputs
    };
};

/**
 * Restates every Bedrock recipe file as the Java recipe files the book loads, reporting what it
 * cannot carry over.
 *
 * @param recipes - The loader's `recipes` registry.
 * @param diagnostics - Where each finding is reported, against the Bedrock file.
 * @param bedrockItemTag - The Bedrock item tags a `tag` ingredient names. A tag it does not know
 *   becomes the Java item tag of the same name.
 * @returns The Java files, in the registry's order, and the material reductions. A file that
 *   becomes one Java recipe keeps its identifier; one that becomes several adds what tells them
 *   apart, as `<identifier>_<key>`: `from_<station>`, the container of a brewing mix, the potion
 *   of a brewing container recipe, or the pattern of a smithing trim.
 */
export const javaRecipesFromBedrock = (
    recipes: ReadonlyMap<string, Definition>,
    diagnostics: Diagnostic[],
    bedrockItemTag: BedrockItemTagLookup = () => undefined
): BedrockRecipeTranslation => {
    const translated: TranslatedRecipe[] = [];
    const materialReductions: MaterialReduction[] = [];
    for (const [identifier, source] of recipes) {
        const report = (severity: 'error' | 'warning', message: string, code = 'recipe.unsupported'): void => {
            diagnostics.push({
                severity,
                code,
                pack: source.pack,
                path: source.path,
                message: `${identifier} ${message}`
            });
        };
        const data = source.data;
        const kind = isRecord(data) ? Object.keys(data).find((key) => key.startsWith('minecraft:recipe_')) : undefined;
        const body = kind === undefined || !isRecord(data) ? undefined : data[kind];
        if (kind === undefined || !isRecord(body)) {
            report('error', 'is not a recipe file', 'recipe.invalid');
            continue;
        }

        const findings: Findings = { errors: [], warnings: [], bedrockItemTag };
        const flush = (): boolean => {
            for (const warning of findings.warnings) report('warning', warning);
            for (const error of findings.errors) report('error', error, 'recipe.invalid');
            return findings.errors.length === 0;
        };

        if (kind === 'minecraft:recipe_material_reduction') {
            const reduction = materialReductionOf(body, findings);
            if (flush() && reduction !== undefined) materialReductions.push({ id: identifier, ...reduction, source });
            continue;
        }

        const files = translateBody(kind, body, findings);
        if (files === undefined) {
            report('warning', `is a ${kind}, which this server does not read, and is not loaded`);
            continue;
        }
        if (!flush()) continue;
        if (files.size === 0) {
            report('warning', 'names no station a Java recipe can be made at and is not loaded');
            continue;
        }

        for (const [key, file] of files) {
            const id = files.size === 1 ? identifier : `${identifier}_${key}`;
            translated.push({ id, data: file, source });
        }
    }
    return { recipes: translated, materialReductions };
};
