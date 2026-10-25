import type {
    ContentView,
    ExplorationMapRequest,
    ItemStack,
    ParseOptions,
    PredicateContextOptions,
    Vec3
} from '@jsprismarine/predicates';
import { PredicateContext, asArray, asNumber, asString, isJsonObject, namespaced } from '@jsprismarine/predicates';

import type { LootEvaluation } from './model';
import { packJson } from './packs';
import { parseLootEntries, produceEntries } from './table';

/**
 * The `ContentView` members `@jsprismarine/predicates` deliberately left open,
 * implemented here because they all turn out to be loot questions: what a
 * furnace makes of an item, what a loot pool entry list rolls into a
 * container, which dye colors exist, whose head a skull carries, and where an
 * exploration map points.
 */

/**
 * The 16 `DyeColor.textureDiffuseColor` values of Java 26.3, in registry
 * order, which is the palette `set_random_dyes` draws from.
 */
export const DYE_COLORS = [
    16383998, 16351261, 13061821, 3847130, 16701501, 8439583, 15961002, 4673362, 10329495, 1481884, 8991416, 3949738,
    8606770, 6192150, 11546150, 1908001
] as const;

/** Finds the structure an `exploration_map` asks for, or nothing when the search comes up empty. */
export type StructureLocator = (request: ExplorationMapRequest, context: PredicateContext) => Vec3 | undefined;

/** What the content view needs that neither the predicate context nor this package can derive. */
export interface LootContentOptions {
    /**
     * Recipes keyed by namespaced id, in the shape a loaded pack stack holds
     * them. `furnace_smelt` reads the `minecraft:smelting` members; without
     * them it reports and leaves the stack alone.
     */
    readonly recipes?: ReadonlyMap<string, unknown>;
    /** Expands an item tag a smelting ingredient names, without the leading `#`. */
    readonly itemTag?: (tag: string) => readonly string[] | undefined;
    /** Where `exploration_map` searches. Without it the modifier reports and leaves the stack alone. */
    readonly structures?: StructureLocator;
    /** Allocates the `minecraft:map_id` an exploration map carries. */
    readonly mapIds?: () => number;
    /**
     * Reads a player profile off an entity for `fill_player_head`. The default
     * returns the entity's own `minecraft:profile` component, which is what a
     * host that already models players has.
     */
    readonly profiles?: (entity: unknown) => unknown;
    /** Overrides {@link DYE_COLORS}, for a pack that redefines the palette. */
    readonly dyeColors?: readonly number[];
    /** Parse options for the entries a `set_contents` modifier carries, so they may name references too. */
    readonly parse?: ParseOptions;
}

interface SmeltingResult {
    readonly id: string;
    readonly count: number;
}

/**
 * Indexes the `minecraft:smelting` recipes by ingredient. Java asks its recipe
 * manager for the first smelting recipe whose single input matches, so the
 * first recipe to claim an ingredient wins here too.
 */
const smeltingIndex = (
    recipes: ReadonlyMap<string, unknown>,
    itemTag: LootContentOptions['itemTag']
): ReadonlyMap<string, SmeltingResult> => {
    const index = new Map<string, SmeltingResult>();

    for (const entry of recipes.values()) {
        const recipe = packJson(entry);
        if (!isJsonObject(recipe)) continue;
        if (namespaced(asString(recipe['type']) ?? '') !== 'minecraft:smelting') continue;

        const result = recipe['result'];
        const resultId = asString(isJsonObject(result) ? result['id'] : result);
        if (resultId === undefined) continue;
        const produced: SmeltingResult = {
            id: namespaced(resultId),
            count: asNumber(isJsonObject(result) ? result['count'] : undefined) ?? 1
        };

        for (const written of asArray(recipe['ingredient'])) {
            const ingredient = asString(written);
            if (ingredient === undefined) continue;
            const ids = ingredient.startsWith('#') ? (itemTag?.(namespaced(ingredient.slice(1))) ?? []) : [ingredient];
            for (const id of ids) {
                const key = namespaced(id);
                if (!index.has(key)) index.set(key, produced);
            }
        }
    }

    return index;
};

/**
 * The smelting index of one content options object, built on first use and
 * kept.
 *
 * Every roll builds a content view of its own, because the view has to close
 * over the context it is attached to. The index does not: it is derived from
 * the recipes and the tag expander alone, and indexing a datapack's whole
 * recipe folder costs far more than the roll that might consult it. Caching it
 * against the options object makes the first roll pay for it and the rest read
 * it, the way Java's recipe manager indexes once per reload.
 *
 * A host that reloads its recipes hands over the new ones in a new options
 * object, which is what loading a pack stack produces.
 */
const smeltingIndexes = new WeakMap<LootContentOptions, ReadonlyMap<string, SmeltingResult>>();

/** The smelting index for one content view, or undefined when the host registered no recipes. */
const smeltingIndexOf = (options: LootContentOptions): ReadonlyMap<string, SmeltingResult> | undefined => {
    const recipes = options.recipes;
    if (recipes === undefined) return undefined;

    const cached = smeltingIndexes.get(options);
    if (cached !== undefined) return cached;

    const index = smeltingIndex(recipes, options.itemTag);
    smeltingIndexes.set(options, index);
    return index;
};

/** The default profile read: whatever `minecraft:profile` the entity already carries. */
const profileComponent = (entity: unknown): unknown => {
    if (!isJsonObject(entity)) return undefined;
    const components = entity['components'];
    return components instanceof Map ? components.get('minecraft:profile') : undefined;
};

/**
 * Builds the content view for one roll. The view needs the context it will be
 * attached to, because `set_contents` rolls its nested entries against that
 * same context, so {@link createLootContext} closes the loop rather than
 * leaving that to a caller.
 */
const createContentView = (
    options: LootContentOptions,
    evaluationOf: () => LootEvaluation | undefined
): ContentView => {
    const smelting = smeltingIndexOf(options);
    const palette = options.dyeColors ?? [...DYE_COLORS];

    const view: ContentView = {
        dyeColors: () => palette,

        profileOf: options.profiles ?? profileComponent,

        rollEntries: (entries) => {
            const evaluation = evaluationOf();
            if (evaluation === undefined) return undefined;

            const parsed = parseLootEntries(entries, {
                ...options.parse,
                diagnostics: evaluation.context.diagnostics
            });
            return produceEntries(parsed.value, evaluation);
        }
    };

    if (smelting !== undefined) {
        view.smeltingResult = (stack: ItemStack): ItemStack | undefined => {
            const evaluation = evaluationOf();
            const result = smelting.get(stack.id);
            if (evaluation === undefined || result === undefined) return undefined;
            return evaluation.context.items.create(result.id, result.count);
        };
    }

    if (options.structures !== undefined) {
        const locate = options.structures;
        view.explorationMap = (stack: ItemStack, request: ExplorationMapRequest): ItemStack | undefined => {
            const evaluation = evaluationOf();
            if (evaluation === undefined) return undefined;

            const found = locate(request, evaluation.context);
            if (found === undefined) return undefined;

            const items = evaluation.context.items;
            const withId =
                options.mapIds === undefined ? stack : items.withComponent(stack, 'minecraft:map_id', options.mapIds());
            // Java's `MapItemSavedData.addTargetDecoration` keys the entry "+" and faces it south.
            return items.withComponent(withId, 'minecraft:map_decorations', {
                '+': { type: request.decoration, x: found.x, z: found.z, rotation: 180 }
            });
        };
    }

    return view;
};

/** Everything {@link createLootContext} takes: the predicate context's own options plus this package's. */
export interface LootContextOptions extends Omit<PredicateContextOptions, 'content'> {
    /** What the content view needs. Omitting it still gives the dye table and nested entry rolls. */
    readonly content?: LootContentOptions;
    /**
     * Java's luck, used by the nested rolls `set_contents` makes. Pass the
     * same value to the roll, or let `LootRegistry` pass both for you.
     */
    readonly luck?: number;
}

/**
 * Builds a predicate context with this package's content view already wired
 * in, which is the only way to close the loop `set_contents` needs: rolling
 * its nested entries takes the very context whose content view is being
 * built.
 */
export const createLootContext = (options: LootContextOptions = {}): PredicateContext => {
    const { content, luck = 0, ...rest } = options;
    const bound: { evaluation?: LootEvaluation } = {};
    const context = new PredicateContext({
        ...rest,
        content: createContentView(content ?? {}, () => bound.evaluation)
    });

    bound.evaluation = { context, luck };
    return context;
};
