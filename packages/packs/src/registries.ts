import { isRecord } from './isRecord';

/**
 * The registries a behavior pack fills and how a file routes into them. A
 * file's top-level folder picks the registry; the identifier is either the
 * definition's `description.identifier`, the pack-relative path for the
 * path-addressed registries (loot tables, trade tables), or the pack and the
 * path for the item catalog, which every pack adds to rather than replaces.
 */

/** The registries a loaded pack stack fills. */
export const REGISTRY_IDS = [
    'blocks',
    'items',
    'entities',
    'lootTables',
    'tradeTables',
    'spawnRules',
    'recipes',
    'biomes',
    'features',
    'featureRules',
    'itemCatalog',
    'customDimensions'
] as const;

/** One registry a loaded pack stack fills. */
export type RegistryId = (typeof REGISTRY_IDS)[number];

interface RegistryRoute {
    registry: RegistryId;
    /**
     * How this registry names definitions. Path-addressed registries use their pack-relative path,
     * so a later pack's file replaces an earlier one's. A `packAndPath` registry also prefixes the
     * pack's header UUID, so each pack's copy of a path is kept and only another layer of the same
     * pack replaces it.
     */
    identifierFrom?: 'path' | 'packAndPath';
    /**
     * The wrapper keys a file of this registry may use, such as
     * `minecraft:entity`. Registries addressed by path have none.
     */
    wrapperKeys?: readonly string[];
}

const ROUTES: Record<string, RegistryRoute> = {
    blocks: { registry: 'blocks', wrapperKeys: ['minecraft:block'] },
    items: { registry: 'items', wrapperKeys: ['minecraft:item'] },
    entities: { registry: 'entities', wrapperKeys: ['minecraft:entity'] },
    loot_tables: { registry: 'lootTables', identifierFrom: 'path' },
    trading: { registry: 'tradeTables', identifierFrom: 'path' },
    spawn_rules: { registry: 'spawnRules', wrapperKeys: ['minecraft:spawn_rules'] },
    recipes: {
        registry: 'recipes',
        wrapperKeys: [
            'minecraft:recipe_shaped',
            'minecraft:recipe_shapeless',
            'minecraft:recipe_furnace',
            'minecraft:recipe_brewing_mix',
            'minecraft:recipe_brewing_container',
            'minecraft:recipe_material_reduction',
            'minecraft:recipe_smithing_transform',
            'minecraft:recipe_smithing_trim'
        ]
    },
    biomes: { registry: 'biomes', wrapperKeys: ['minecraft:biome'] },
    features: { registry: 'features' },
    feature_rules: { registry: 'featureRules', wrapperKeys: ['minecraft:feature_rules'] },
    // The Bedrock Dedicated Server merges every pack's catalog into the menu, in pack order.
    item_catalog: { registry: 'itemCatalog', identifierFrom: 'packAndPath' },
    // Bedrock's own name for the folder. The Java `dimensions` registry holds datapack level stems.
    dimensions: { registry: 'customDimensions', wrapperKeys: ['minecraft:dimension'] }
};

/**
 * Routes a pack-relative path to its registry by top-level folder.
 *
 * @returns The registry, or undefined for paths no registry owns.
 */
export const routeForPath = (path: string): RegistryId | undefined => {
    if (!path.endsWith('.json')) return undefined;
    const folder = path.split('/')[0]!;
    return ROUTES[folder]?.registry;
};

/**
 * Whether a registry identifies a definition by its pack-relative file path.
 *
 * @param registry - The registry a file routes to.
 */
export const isPathAddressedRegistry = (registry: RegistryId): boolean =>
    Object.values(ROUTES).some((route) => route.registry === registry && route.identifierFrom === 'path');

/**
 * Whether every pack's copy of a path counts in a registry, so a later pack
 * does not supersede an earlier pack's file there.
 *
 * @param registry - The registry a file routes to.
 */
export const isPerPackRegistry = (registry: RegistryId): boolean =>
    Object.values(ROUTES).some((route) => route.registry === registry && route.identifierFrom === 'packAndPath');

/**
 * The identifier a definition is registered under: `description.identifier`
 * from the file's wrapper object where the registry has one, otherwise the
 * pack-relative path, prefixed with `packUuid` and a slash for a
 * {@link isPerPackRegistry per-pack registry}. Features declare their wrapper
 * per feature type, so any single `minecraft:*` wrapper key counts for them.
 *
 * @param packUuid - The header UUID of the pack the file comes from.
 * @returns The identifier, or undefined when the file declares none.
 */
export const identifierForDefinition = (
    registry: RegistryId,
    path: string,
    data: unknown,
    packUuid: string
): string | undefined => {
    const route = Object.values(ROUTES).find((candidate) => candidate.registry === registry)!;

    if (route.identifierFrom === 'path') return path;
    if (route.identifierFrom === 'packAndPath') return `${packUuid}/${path}`;
    if (!isRecord(data)) return undefined;

    const wrapperKey = route.wrapperKeys
        ? route.wrapperKeys.find((key) => key in data)
        : Object.keys(data).find((key) => key.startsWith('minecraft:'));
    if (!wrapperKey) return undefined;

    const wrapper = data[wrapperKey];
    if (!isRecord(wrapper) || !isRecord(wrapper.description)) return undefined;
    const identifier = wrapper.description.identifier;
    return typeof identifier === 'string' ? identifier : undefined;
};
