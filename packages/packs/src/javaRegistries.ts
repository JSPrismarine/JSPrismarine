/**
 * The registries a Java datapack fills and how a file routes into them. The
 * folder under `data/<namespace>/` picks the registry, using the 26.3 singular
 * directory names, and the identifier is the namespaced id derived from the
 * path: `data/minecraft/loot_table/blocks/stone.json` is
 * `minecraft:blocks/stone` in `lootTablesJava`.
 */

/** The Java-sourced registries a loaded datapack fills. */
export const JAVA_REGISTRY_IDS = [
    'lootTablesJava',
    'recipesJava',
    'advancements',
    'tags',
    'enchantments',
    'damageTypes',
    'predicates',
    'itemModifiers',
    'functions'
] as const;

/** One Java-sourced registry. */
export type JavaRegistryId = (typeof JAVA_REGISTRY_IDS)[number];

/**
 * How a registry composes when more than one pack provides the same id.
 * These are Java's three modes:
 *
 * - `override`: the last pack that has the file wins, whole.
 * - `tags`: `values` concatenate in pack order, and a file that sets
 *   `replace` discards everything earlier.
 * - `assign`: the objects merge key by key, a later pack's key winning.
 */
export type MergeMode = 'override' | 'tags' | 'assign';

/**
 * The merge mode per registry. Every 26.3 data registry but tags overrides.
 * `assign` is the mode Java gives its language files, which live in a
 * resource pack rather than a datapack, so no registry here selects it yet.
 */
export const MERGE_MODES: Readonly<Record<JavaRegistryId, MergeMode>> = {
    lootTablesJava: 'override',
    recipesJava: 'override',
    advancements: 'override',
    tags: 'tags',
    enchantments: 'override',
    damageTypes: 'override',
    predicates: 'override',
    itemModifiers: 'override',
    functions: 'override'
};

/**
 * The file extension of an mcfunction, which is the one datapack file that is
 * not JSON.
 */
export const FUNCTION_EXTENSION = '.mcfunction';

/** The 26.3 directory under `data/<namespace>/` for each JSON registry. */
const DIRECTORIES: Record<string, Exclude<JavaRegistryId, 'tags' | 'functions'>> = {
    loot_table: 'lootTablesJava',
    recipe: 'recipesJava',
    advancement: 'advancements',
    enchantment: 'enchantments',
    damage_type: 'damageTypes',
    predicate: 'predicates',
    item_modifier: 'itemModifiers'
};

/** Tag registry roots under `tags/` that span two path segments, such as `worldgen/biome`. */
const TWO_SEGMENT_TAG_ROOTS = ['worldgen'];

const NAMESPACE_PATTERN = /^[a-z0-9_.-]+$/;
const PATH_PATTERN = /^[a-z0-9_./-]+$/;

/** Where one datapack file routes: its registry and the id it registers under. */
export interface JavaRoute {
    registry: JavaRegistryId;
    /**
     * The namespaced id. Tag ids carry the tagged registry as a prefix, such
     * as `block/minecraft:mineable/axe`, because one datapack tags many
     * registries and ids repeat across them.
     */
    identifier: string;
    /** The registry a tag file tags, such as `block` or `worldgen/biome`. Only set for tags. */
    taggedRegistry?: string;
}

/**
 * Routes `data/<namespace>/function/<path>.mcfunction`, which is the one
 * datapack file whose contents are text rather than JSON.
 *
 * The id is the one `/function` writes: `data/pack/function/setup/stage.mcfunction`
 * is `pack:setup/stage`.
 */
const routeFunctionPath = (path: string): JavaRoute | undefined => {
    const segments = path.slice('data/'.length, -FUNCTION_EXTENSION.length).split('/');
    const [namespace, folder, ...rest] = segments;
    if (!namespace || folder !== 'function' || rest.length === 0) return undefined;
    if (!NAMESPACE_PATTERN.test(namespace)) return undefined;

    const idPath = rest.join('/');
    if (!PATH_PATTERN.test(idPath)) return undefined;
    return { registry: 'functions', identifier: `${namespace}:${idPath}` };
};

/**
 * Routes a pack-relative path to its registry and identifier. Paths outside
 * `data/`, files that are neither JSON nor `.mcfunction`, registries this
 * loader does not consume, and the built-in packs nested under
 * `data/<namespace>/datapacks/` return undefined.
 */
export const routeDatapackPath = (path: string): JavaRoute | undefined => {
    if (!path.startsWith('data/')) return undefined;
    if (path.endsWith(FUNCTION_EXTENSION)) return routeFunctionPath(path);
    if (!path.endsWith('.json')) return undefined;

    const segments = path.slice('data/'.length, -'.json'.length).split('/');
    const [namespace, folder, ...rest] = segments;
    if (!namespace || !folder || rest.length === 0) return undefined;
    if (!NAMESPACE_PATTERN.test(namespace)) return undefined;

    if (folder === 'tags') {
        const registrySegments = TWO_SEGMENT_TAG_ROOTS.includes(rest[0]!) ? 2 : 1;
        const taggedRegistry = rest.slice(0, registrySegments).join('/');
        const tagPath = rest.slice(registrySegments).join('/');
        if (tagPath.length === 0 || !PATH_PATTERN.test(tagPath)) return undefined;
        return { registry: 'tags', identifier: `${taggedRegistry}/${namespace}:${tagPath}`, taggedRegistry };
    }

    const registry = DIRECTORIES[folder];
    if (!registry) return undefined;

    const idPath = rest.join('/');
    if (!PATH_PATTERN.test(idPath)) return undefined;
    return { registry, identifier: `${namespace}:${idPath}` };
};
