import type {
    BehaviorRegistry,
    ComponentReader,
    ComponentRegistry,
    Definition,
    Diagnostic,
    FlagSpec
} from '@jsprismarine/content';
import { Registry, resolveTypes } from '@jsprismarine/content';

import { createItemComponentRegistry } from './components/catalog';
import type { ItemFlag, ItemHooks, ItemType } from './hooks';
import { itemTypesTable } from './tables';

/** The name the registry of item types is built under; it appears in holders and diagnostics. */
export const ITEM_REGISTRY_NAME = 'items';

/** The registry of resolved item types, keyed by Bedrock item identifier. */
export type ItemRegistry = Registry<ItemType>;

/**
 * Reads the component list out of an item definition.
 *
 * An item definition's `data` is a plain `components` map, which is both the
 * shape the generated table writes and the shape Java's own default component
 * report uses. Items have no permutations and no component groups, so no
 * entry sets `override` and the dispatch order is the order the definition
 * lists its components in.
 */
export const readItemComponents: ComponentReader = function* (definition: Definition) {
    const data: Record<string, unknown> = { ...(definition.data as object) };
    const components = data.components;
    if (typeof components !== 'object' || components === null || Array.isArray(components)) return;
    for (const [name, value] of Object.entries(components)) yield { name, value };
};

/**
 * The load-time flags every item type carries.
 *
 * Each is the presence of one Java component, which is the whole point of the
 * component model: "is a tool" stopped being a class and became
 * `minecraft:tool`. Numbers belong in the flattened table in `facts.ts`
 * rather than here.
 */
export const ITEM_FLAGS = {
    isFood: (type) => type.hasComponent('minecraft:food'),
    isTool: (type) => type.hasComponent('minecraft:tool'),
    isWeapon: (type) => type.hasComponent('minecraft:weapon'),
    isDamageable: (type) => type.hasComponent('minecraft:max_damage'),
    isEquippable: (type) => type.hasComponent('minecraft:equippable'),
    isFuel: (type) => type.hasComponent('minecraft:cooking_fuel')
} satisfies FlagSpec<ItemHooks, Record<ItemFlag, unknown>>;

/**
 * The vanilla item definitions, one per Bedrock item identifier, built from
 * the generated table.
 *
 * The identifier is Bedrock's and the components are Java's, which is the
 * plan's split: the client has to recognize the item, and the server has to
 * know what it does.
 */
export const vanillaItemDefinitions = (): Definition[] =>
    Object.entries(itemTypesTable.items).map(([identifier, row]) => ({
        identifier,
        registry: ITEM_REGISTRY_NAME,
        pack: `java-${itemTypesTable.javaVersion}`,
        path: `reports/minecraft/components/item/${row.java.slice('minecraft:'.length)}.json`,
        data: row
    }));

/** Options for {@link loadItemTypes}. */
export interface LoadItemTypesOptions {
    /** The component names to resolve against, defaulting to all 122 Java types. */
    components?: ComponentRegistry<ItemHooks>;
    /** The behavior families to attach, which is where item behavior lives. */
    behaviors?: BehaviorRegistry<ItemHooks>;
    /**
     * The definitions to resolve, defaulting to {@link vanillaItemDefinitions}.
     * A later definition for an identifier the list already has replaces it,
     * which is how a pack overrides a vanilla item.
     */
    definitions?: Iterable<Definition>;
    /** Fail the load when any diagnostic is reported, which the test suites do. */
    strict?: boolean;
}

/** What {@link loadItemTypes} returns. */
export interface LoadedItemTypes {
    /** The registry, already rebuilt, ready to hand out holders. */
    registry: ItemRegistry;
    /** Identifier to resolved type, in definition order. */
    types: ReadonlyMap<string, ItemType>;
    /** Everything the resolve reported, in the shape `@jsprismarine/packs` uses. */
    diagnostics: readonly Diagnostic[];
}

/**
 * Resolves item definitions into types and builds the registry.
 *
 * @throws {ContentLoadError} In strict mode, when any diagnostic is reported.
 */
export const loadItemTypes = (options: LoadItemTypesOptions = {}): LoadedItemTypes => {
    const { types, diagnostics } = resolveTypes<ItemHooks, typeof ITEM_FLAGS>(
        options.definitions ?? vanillaItemDefinitions(),
        {
            components: options.components ?? createItemComponentRegistry(),
            ...(options.behaviors !== undefined ? { behaviors: options.behaviors } : {}),
            read: readItemComponents,
            flags: ITEM_FLAGS,
            ...(options.strict !== undefined ? { strict: options.strict } : {})
        }
    );

    const registry: ItemRegistry = new Registry<ItemType>(ITEM_REGISTRY_NAME);
    registry.rebuild(types);
    return { registry, types, diagnostics };
};
