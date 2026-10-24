import { JAVA_REGISTRY_IDS } from './javaRegistries';
import type { Definitions } from './load';

/**
 * The unmapped-identifier report. Java datapack definitions reference Java
 * identifiers: items in loot entries, blocks in predicates, tag members. The
 * report walks the loaded Java definitions for identifier-valued fields and
 * resolves each referenced identifier through an injected resolver, so the
 * mapping package can later say which ones translate to Bedrock. The default
 * resolver knows nothing, which makes the report a complete list of every
 * referenced Java identifier.
 */

/**
 * How one Java identifier resolves to this runtime: `known` maps to a Bedrock
 * identifier, `loss` is on the reviewed loss allow list, `unknown` is neither.
 */
export type IdentifierResolution = 'known' | 'loss' | 'unknown';

/**
 * Resolves Java identifiers per registry. `@jsprismarine/mapping` implements
 * this seam; this package only defines it.
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

/** One referenced Java identifier with how it resolves and how often it appears. */
export interface ReferencedIdentifier {
    /** The Java registry the reference points into, such as `item` or `worldgen/biome`. */
    registry: string;
    /** The namespaced id, normalized to carry a namespace; tag references keep their `#`. */
    id: string;
    resolution: IdentifierResolution;
    /** How many identifier-valued fields across the loaded definitions reference this id. */
    references: number;
}

/**
 * The fields whose string values are Java identifiers, keyed by field name,
 * with the registry each points into. This is a heuristic by field name: the
 * names come from the 26.3 grammars for loot, recipes, advancements,
 * enchantments and predicates, so a custom field that reuses one of these
 * names is reported too.
 */
const IDENTIFIER_FIELDS: Readonly<Record<string, string>> = {
    name: 'item',
    item: 'item',
    items: 'item',
    id: 'item',
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

type Counts = Map<string, Map<string, number>>;

const count = (counts: Counts, registry: string, value: unknown): void => {
    if (typeof value !== 'string') return;
    const id = normalizeId(value);
    if (!id) return;
    const byId = counts.get(registry) ?? new Map<string, number>();
    counts.set(registry, byId);
    byId.set(id, (byId.get(id) ?? 0) + 1);
};

/** Walks a definition, counting the values of identifier-valued fields. */
const walk = (value: unknown, counts: Counts): void => {
    if (Array.isArray(value)) {
        for (const member of value) walk(member, counts);
        return;
    }
    if (!isRecord(value)) return;

    for (const [key, member] of Object.entries(value)) {
        const registry = IDENTIFIER_FIELDS[key];
        if (registry) {
            if (typeof member === 'string') count(counts, registry, member);
            else if (Array.isArray(member)) for (const entry of member) count(counts, registry, entry);
        }
        walk(member, counts);
    }
};

/** Counts a merged tag's members against the registry the tag file tags. */
const walkTag = (identifier: string, data: unknown, counts: Counts): void => {
    const prefix = identifier.split(':')[0]!;
    const taggedRegistry = prefix.split('/').slice(0, -1).join('/');
    if (!taggedRegistry || !isRecord(data) || !Array.isArray(data.values)) return;

    for (const entry of data.values) {
        if (typeof entry === 'string') count(counts, taggedRegistry, entry);
        else if (isRecord(entry)) count(counts, taggedRegistry, entry.id);
    }
};

/**
 * Walks every loaded Java definition and reports each referenced Java
 * identifier with its resolution, sorted by registry and id. Tag members
 * count against the registry their tag file tags; every other reference
 * counts by field name per {@link IDENTIFIER_FIELDS}.
 */
export const reportIdentifiers = (
    definitions: Definitions,
    resolver: IdentifierResolver = unknownResolver
): ReferencedIdentifier[] => {
    const counts: Counts = new Map();

    for (const registry of JAVA_REGISTRY_IDS) {
        for (const definition of definitions[registry].values()) {
            if (registry === 'tags') walkTag(definition.identifier, definition.data, counts);
            else walk(definition.data, counts);
        }
    }

    const report: ReferencedIdentifier[] = [];
    for (const registry of [...counts.keys()].sort()) {
        const byId = counts.get(registry)!;
        for (const id of [...byId.keys()].sort()) {
            report.push({ registry, id, resolution: resolver.resolve(registry, id), references: byId.get(id)! });
        }
    }
    return report;
};
