import type { ElementRegistry, ReferenceRegistry, ReferenceResolver } from '@jsprismarine/predicates';
import { isJsonObject, namespaced } from '@jsprismarine/predicates';

/**
 * The adapter between a loaded pack stack and this package.
 *
 * `Definitions` from `@jsprismarine/packs` satisfies {@link LootPackDefinitions}
 * structurally, so a host hands that object straight over and this package
 * keeps no dependency on the loader.
 */

/** The registries of a loaded pack stack this package reads. */
export interface LootPackDefinitions {
    /** Loot tables keyed by namespaced id, such as `minecraft:blocks/stone`. */
    readonly lootTablesJava: ReadonlyMap<string, unknown>;
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

const ELEMENT_SOURCES: Readonly<Record<string, keyof LootPackDefinitions>> = {
    loot_table: 'lootTablesJava',
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
        const source = ELEMENT_SOURCES[registry];
        return source === undefined ? undefined : packJson(definitions[source]?.get(id));
    },
    tag: (registry: ReferenceRegistry, id: string) => tagMembers(packJson(definitions.tags?.get(`${registry}/${id}`)))
});
