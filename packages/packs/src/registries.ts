/**
 * The registries a behavior pack fills and how a file routes into them. A
 * file's top-level folder picks the registry; the identifier is either the
 * definition's `description.identifier` or, for the path-addressed registries
 * (loot tables, trade tables, the item catalog), the pack-relative path.
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
    'itemCatalog'
] as const;

/** One registry a loaded pack stack fills. */
export type RegistryId = (typeof REGISTRY_IDS)[number];

interface RegistryRoute {
    registry: RegistryId;
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
    loot_tables: { registry: 'lootTables' },
    trading: { registry: 'tradeTables' },
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
    item_catalog: { registry: 'itemCatalog' }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

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
 * The identifier a definition is registered under: `description.identifier`
 * from the file's wrapper object where the registry has one, otherwise the
 * pack-relative path. Features declare their wrapper per feature type, so any
 * single `minecraft:*` wrapper key counts for them.
 *
 * @returns The identifier, or undefined when the file declares none.
 */
export const identifierForDefinition = (registry: RegistryId, path: string, data: unknown): string | undefined => {
    const route = Object.values(ROUTES).find((candidate) => candidate.registry === registry)!;

    if (!route.wrapperKeys && registry !== 'features') return path;
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
