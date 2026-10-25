import { JAVA_REGISTRY_DIRECTORIES, JAVA_REGISTRY_IDS } from './javaRegistries';
import type { JavaRegistryId } from './javaRegistries';
import type { Definition, Definitions } from './load';

/**
 * The unmapped-identifier report. Java datapack definitions reference Java
 * identifiers: items in loot entries, blocks in predicates, tag members. The
 * report walks the loaded Java definitions for identifier-valued fields and
 * resolves each referenced identifier, so a loader can refuse to start when
 * one of them reaches neither Bedrock nor anything this stack defines.
 *
 * Two things account for a reference. The pack stack accounts for the ones
 * that resolve inside it: a `#tag` whose tag file the stack carries, and an
 * element of a registry a datapack fills, such as one loot table calling
 * another. Those stay Java-shaped inside the server and never cross to a
 * Bedrock client, so there is nothing to translate. Everything else goes to
 * the injected resolver, which `@jsprismarine/mapping` implements over its
 * generated tables. The default resolver knows nothing, which leaves the
 * report listing every reference the pack stack does not close itself.
 */

/**
 * How one Java identifier resolves to this runtime: `known` reaches Bedrock
 * or resolves inside the pack stack, `loss` is on the reviewed loss allow
 * list, `unknown` is neither.
 */
export type IdentifierResolution = 'known' | 'loss' | 'unknown';

/**
 * Resolves Java identifiers per registry. `@jsprismarine/mapping` implements
 * this seam; this package only defines it.
 *
 * A resolver is asked about plain identifiers only. Tag references resolve
 * against the loaded tags, which the resolver cannot see, so
 * {@link reportIdentifiers} answers those itself.
 */
export interface IdentifierResolver {
    /**
     * Resolves one referenced identifier.
     *
     * @param registry - The Java registry the reference points into, such as `item` or `block`.
     * @param javaId - The namespaced id; tag references keep their `#` prefix.
     */
    resolve(registry: string, javaId: string): IdentifierResolution;
}

/** The default resolver: every identifier is `unknown`, so the report lists them all. */
export const unknownResolver: IdentifierResolver = { resolve: () => 'unknown' };

/** What accounted for a referenced identifier. */
export type IdentifierSource =
    /** A tag file or a registry element the loaded pack stack carries. */
    | 'pack'
    /** The injected resolver's tables. */
    | 'resolver';

/** One referenced Java identifier with how it resolves and how often it appears. */
export interface ReferencedIdentifier {
    /** The Java registry the reference points into, such as `item` or `worldgen/biome`. */
    registry: string;
    /** The namespaced id, normalized to carry a namespace; tag references keep their `#`. */
    id: string;
    resolution: IdentifierResolution;
    /** What answered: the loaded pack stack, or the injected resolver. */
    source: IdentifierSource;
    /** The pack holding the first definition that references the id, in report order. */
    pack: string;
    /** That definition's pack-relative path. */
    path: string;
    /** How many identifier-valued fields across the loaded definitions reference this id. */
    references: number;
}

/**
 * The fields whose string values are Java identifiers, keyed by field name,
 * with the registry each points into. This is a heuristic by field name: the
 * names come from the 26.3 grammars for loot, recipes, advancements,
 * enchantments and predicates, so a custom field that reuses one of these
 * names is reported too.
 *
 * `id` is absent because it is the one name 26.3 reuses across grammars;
 * {@link registryForId} decides it from the object the field sits in, and
 * {@link registryForField} is where both rules meet.
 */
const IDENTIFIER_FIELDS: Readonly<Record<string, string>> = {
    name: 'item',
    item: 'item',
    items: 'item',
    block: 'block',
    blocks: 'block',
    fluid: 'fluid',
    fluids: 'fluid',
    entity_type: 'entity_type',
    enchantment: 'enchantment',
    enchantments: 'enchantment',
    supported_items: 'item',
    primary_items: 'item',
    loot_table: 'loot_table',
    loot_tables: 'loot_table',
    loot_table_id: 'loot_table',
    effect: 'mob_effect',
    function: 'function',
    predicate: 'predicate'
};

/**
 * What an `id` field names, decided by the keys beside it. Java 26.3 spells
 * five unrelated things `id`, and reading all five as items is how
 * `minecraft:enchantment.aqua_affinity` and `#minecraft:is_explosion` used to
 * reach the report as missing items.
 *
 * @param siblings - The object the `id` field belongs to.
 * @returns The registry the id points into, or undefined when it names no registry entry.
 */
const registryForId = (siblings: Record<string, unknown>): string | undefined => {
    // An attribute modifier's own name: a free-form resource location the
    // enchantment picks, not an entry of any registry.
    if ('attribute' in siblings) return undefined;
    // `damage_source_properties` lists damage type tags as `{ id, expected }`.
    if ('expected' in siblings) return 'damage_type';
    // A mob effect instance, as the `suspicious_stew_effects` component writes it.
    if ('duration' in siblings || 'amplifier' in siblings) return 'mob_effect';
    // A block state, as a block state provider and the worldgen features write it.
    if ('properties' in siblings) return 'block';
    // The one loot function that names its subject `id` rather than by type.
    if (siblings.type === 'minecraft:set_potion') return 'potion';
    // Everything else is an item stack: `{ id, count }` is 26.3's item stack form.
    return 'item';
};

/**
 * The registry one field of one object points into, or undefined when the
 * field names nothing a registry holds.
 *
 * @param key - The field name.
 * @param siblings - The object the field belongs to, which decides the ambiguous names.
 */
const registryForField = (key: string, siblings: Record<string, unknown>): string | undefined => {
    if (key === 'id') return registryForId(siblings);
    // A `minecraft:dynamic` loot entry names a drop the block itself supplies,
    // such as the sherds a decorated pot breaks into. The name is a key into
    // the block's own drop list, not an item.
    if (key === 'name' && siblings.type === 'minecraft:dynamic') return undefined;
    return IDENTIFIER_FIELDS[key];
};

const IDENTIFIER_PATTERN = /^#?[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const BARE_PATTERN = /^#?[a-z0-9_./-]+$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Normalizes an identifier-shaped string, defaulting a missing namespace to `minecraft`. */
const normalizeId = (value: string): string | undefined => {
    if (IDENTIFIER_PATTERN.test(value)) return value;
    if (BARE_PATTERN.test(value) && !value.includes(':')) {
        return value.startsWith('#') ? `#minecraft:${value.slice(1)}` : `minecraft:${value}`;
    }
    return undefined;
};

/** One counted identifier: how often it is referenced, and where it was first seen. */
interface Reference {
    count: number;
    pack: string;
    path: string;
}

type Counts = Map<string, Map<string, Reference>>;

const count = (counts: Counts, registry: string, value: unknown, from: Definition): void => {
    if (typeof value !== 'string') return;
    const id = normalizeId(value);
    if (!id) return;
    const byId = counts.get(registry) ?? new Map<string, Reference>();
    counts.set(registry, byId);
    const held = byId.get(id);
    if (held) held.count += 1;
    else byId.set(id, { count: 1, pack: from.pack, path: from.path });
};

/** Walks a definition, counting the values of identifier-valued fields. */
const walk = (value: unknown, counts: Counts, from: Definition): void => {
    if (Array.isArray(value)) {
        for (const member of value) walk(member, counts, from);
        return;
    }
    if (!isRecord(value)) return;

    for (const [key, member] of Object.entries(value)) {
        const registry = registryForField(key, value);
        if (registry) {
            if (typeof member === 'string') count(counts, registry, member, from);
            else if (Array.isArray(member)) for (const entry of member) count(counts, registry, entry, from);
        }
        walk(member, counts, from);
    }
};

/** Counts a merged tag's members against the registry the tag file tags. */
const walkTag = (data: unknown, counts: Counts, from: Definition): void => {
    const prefix = from.identifier.split(':')[0]!;
    const taggedRegistry = prefix.split('/').slice(0, -1).join('/');
    if (!taggedRegistry || !isRecord(data) || !Array.isArray(data.values)) return;

    for (const entry of data.values) {
        if (typeof entry === 'string') count(counts, taggedRegistry, entry, from);
        else if (isRecord(entry)) count(counts, taggedRegistry, entry.id, from);
    }
};

/**
 * The loaded registry each reference registry resolves against, derived from
 * the directory names a datapack routes by. Functions are added by hand
 * because their files are mcfunction rather than JSON and route separately.
 */
const PACK_REGISTRIES: Readonly<Record<string, JavaRegistryId>> = {
    ...JAVA_REGISTRY_DIRECTORIES,
    function: 'functions'
};

/**
 * Whether the loaded pack stack closes the reference itself: a `#tag` whose
 * tag file it carries, or an element of a registry a datapack fills.
 */
const inPackStack = (definitions: Definitions, registry: string, id: string): boolean => {
    if (id.startsWith('#')) return definitions.tags.has(`${registry}/${id.slice(1)}`);
    const held = PACK_REGISTRIES[registry];
    return held !== undefined && definitions[held].has(id);
};

/**
 * Walks every loaded Java definition and reports each referenced Java
 * identifier with its resolution, sorted by registry and id. Tag members
 * count against the registry their tag file tags; every other reference
 * counts by field name per {@link IDENTIFIER_FIELDS}, except `id`, which
 * {@link registryForId} decides from its siblings.
 *
 * The resolver is asked first, so a reviewed loss stays a loss even when the
 * stack also defines the identifier; references the resolver does not know
 * fall back to the pack stack.
 *
 * @param definitions - The composed pack stack, as {@link import('./load').load} returns it.
 * @param resolver - The Bedrock-side resolver; defaults to {@link unknownResolver}.
 * @returns One entry per distinct referenced identifier, sorted by registry then id.
 */
export const reportIdentifiers = (
    definitions: Definitions,
    resolver: IdentifierResolver = unknownResolver
): ReferencedIdentifier[] => {
    const counts: Counts = new Map();

    for (const registry of JAVA_REGISTRY_IDS) {
        for (const definition of definitions[registry].values()) {
            if (registry === 'tags') walkTag(definition.data, counts, definition);
            else walk(definition.data, counts, definition);
        }
    }

    const report: ReferencedIdentifier[] = [];
    for (const registry of [...counts.keys()].sort()) {
        const byId = counts.get(registry)!;
        for (const id of [...byId.keys()].sort()) {
            const { count: references, pack, path } = byId.get(id)!;
            const resolved = resolver.resolve(registry, id);
            const closed = resolved === 'unknown' && inPackStack(definitions, registry, id);
            report.push({
                registry,
                id,
                resolution: closed ? 'known' : resolved,
                source: closed ? 'pack' : 'resolver',
                pack,
                path,
                references
            });
        }
    }
    return report;
};
