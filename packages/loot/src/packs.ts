import type { ElementRegistry, ReferenceRegistry, ReferenceResolver } from '@jsprismarine/predicates';
import { isJsonObject, namespaced } from '@jsprismarine/predicates';

import type { LootDialect } from './dialect';

/**
 * The adapter between a loaded pack stack and this package, and the rule that
 * a map of loot tables arrives carrying the dialect it is written in.
 *
 * A datapack's tables and a behavior pack's tables are both
 * `ReadonlyMap<string, unknown>`, so for as long as the dialect was a separate
 * option beside them the compiler had no way to tell a host that had paired
 * the wrong two. One did: the Bedrock map went into a field named
 * `lootTablesJava`, and the only thing that kept it working was a second
 * argument saying `dialect: 'bedrock'`. Nothing checked the two agreed.
 *
 * {@link LootTableSource} removes the pairing. The dialect is a member of the
 * value that holds the tables, built by {@link javaLootTables} or
 * {@link bedrockLootTables}, so the two cannot be stated separately and cannot
 * disagree. A raw map no longer fits the field at all, which is what turns
 * last time's silent behavior change into a compile error.
 */

/**
 * A map of loot tables and the edition whose grammar its files are written in.
 *
 * Build one with {@link javaLootTables} or {@link bedrockLootTables}; there is
 * no third way to make one, which is the point.
 *
 * @typeParam Dialect - Narrowed by the two builders, so a caller that needs
 *   Java tables specifically can say `LootTableSource<'java'>` and have a
 *   Bedrock source refuse to compile.
 */
export interface LootTableSource<Dialect extends LootDialect = LootDialect> {
    /** Which edition's spelling the tables are written in. */
    readonly dialect: Dialect;
    /** The tables, keyed by the id the pack stack registered them under. */
    readonly tables: ReadonlyMap<string, unknown>;
}

/**
 * A datapack's loot tables, in Java's spelling.
 *
 * @param tables - `Definitions.lootTablesJava` from `@jsprismarine/packs`, or any map keyed by namespaced id.
 */
export const javaLootTables = (tables: ReadonlyMap<string, unknown>): LootTableSource<'java'> => ({
    dialect: 'java',
    tables
});

/**
 * A behavior pack's loot tables, in Bedrock's spelling.
 *
 * @param tables - `Definitions.lootTables` from `@jsprismarine/packs`, keyed by the pack-relative
 *   path a `minecraft:equipment` component names, such as `loot_tables/entities/zombie_equipment.json`.
 */
export const bedrockLootTables = (tables: ReadonlyMap<string, unknown>): LootTableSource<'bedrock'> => ({
    dialect: 'bedrock',
    tables
});

/**
 * The registries of a loaded pack stack this package reads.
 *
 * Every member but {@link LootPackDefinitions.lootTables} is structural, so a
 * host spreads `Definitions` from `@jsprismarine/packs` in and overrides that
 * one member with the source it means.
 */
export interface LootPackDefinitions {
    /** The tables to roll, with the dialect they are written in. */
    readonly lootTables: LootTableSource;
    readonly predicates?: ReadonlyMap<string, unknown>;
    readonly itemModifiers?: ReadonlyMap<string, unknown>;
    readonly recipesJava?: ReadonlyMap<string, unknown>;
    /** Tags keyed the way the loader keys them, with the tagged registry first: `item/minecraft:planks`. */
    readonly tags?: ReadonlyMap<string, unknown>;
}

/**
 * Reads the JSON out of one pack registry entry. The loader wraps each file
 * in a record carrying its pack and path, so an object with a `data` member
 * is that record and anything else is the parsed file itself. No Java file
 * this package reads has a top-level `data` key, so the two never collide.
 */
export const packJson = (entry: unknown): unknown => (isJsonObject(entry) && 'data' in entry ? entry['data'] : entry);

/**
 * The members of a type that hold a plain id-keyed registry.
 *
 * Derived rather than listed so that tagging a second member the way
 * {@link LootPackDefinitions.lootTables} is tagged takes it out of
 * {@link ELEMENT_SOURCES} at compile time instead of at the first lookup.
 */
type RegistryMembers<T> = {
    [K in keyof T]-?: NonNullable<T[K]> extends ReadonlyMap<string, unknown> ? K : never;
}[keyof T];

/** Which registry each referenceable element kind is looked up in. `loot_table` is {@link LootPackDefinitions.lootTables}. */
const ELEMENT_SOURCES: Readonly<Record<string, RegistryMembers<LootPackDefinitions>>> = {
    predicate: 'predicates',
    item_modifier: 'itemModifiers',
    recipe: 'recipesJava'
};

/** Expands one tag file's `values` into member ids, keeping nested `#tag` entries for the caller to follow. */
const tagMembers = (file: unknown): readonly string[] | undefined => {
    if (!isJsonObject(file) || !Array.isArray(file['values'])) return undefined;
    return file['values'].flatMap((entry: unknown) => {
        const written = typeof entry === 'string' ? entry : isJsonObject(entry) ? entry['id'] : undefined;
        if (typeof written !== 'string') return [];
        return [written.startsWith('#') ? written : namespaced(written)];
    });
};

/**
 * Builds the reference resolver the grammar needs from a loaded pack stack,
 * so a loot table may name a predicate, an item modifier or another loot
 * table by id or by tag.
 */
export const createPackResolver = (definitions: LootPackDefinitions): ReferenceResolver => ({
    element: (registry: ElementRegistry, id: string) => {
        if (registry === 'loot_table') return packJson(definitions.lootTables.tables.get(id));

        const source = ELEMENT_SOURCES[registry];
        return source === undefined ? undefined : packJson(definitions[source]?.get(id));
    },
    tag: (registry: ReferenceRegistry, id: string) => tagMembers(packJson(definitions.tags?.get(`${registry}/${id}`)))
});
