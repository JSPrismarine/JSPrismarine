/**
 * The behavior families the parity dashboard reports on.
 *
 * A family names one row of the dashboard, after the behavior families of
 * docs/research/engine-behavior-inventory.md plus one row per mapping domain (plan section 8).
 * Every parity test lives inside a top-level `describe(<family>)`, so the dashboard can group
 * tests by splitting the test's full name - no mapping file.
 *
 * A family id is dot-separated lowercase segments: a group (`registry`, `mapping`, `blocks`,
 * `conformance`, ...) followed by the domain. Later slices add families by adding constants
 * here; the dashboard picks up any id that matches {@link FAMILY_ID_PATTERN}.
 */
export const FAMILIES = {
    /** Block names and state sets against the block palette capture. */
    registryBlocks: 'registry.blocks',
    /** Item names, numeric ids and component flags against the item list capture. */
    registryItems: 'registry.items',
    /** The advertised actor types against the entity identifiers golden. */
    registryEntities: 'registry.entities',
    /** Biome names and numeric ids against the biome definitions golden. */
    registryBiomes: 'registry.biomes',
    /** The public parity claim stays in step with the research note it cites. */
    conformanceClaim: 'conformance.claim'
} as const;

/** One of the family ids in {@link FAMILIES}. */
export type Family = (typeof FAMILIES)[keyof typeof FAMILIES];

/**
 * Family groups later slices add rows under. Reserved here so the prefix scheme is fixed
 * before those slices exist: `mapping.*` for the Chunker-style property tests of
 * `@jsprismarine/mapping` (plan section 5), `blocks.*`, `items.*`, `recipes.*`, `loot.*`,
 * `entities.*`, `worldgen.*` and `commands.*` for the Java-golden comparisons of
 * docs/research/extraction-and-parity-verification.md section 5.
 */
export const RESERVED_FAMILY_GROUPS = [
    'mapping',
    'blocks',
    'items',
    'recipes',
    'loot',
    'entities',
    'worldgen',
    'commands'
] as const;

/** What a family id looks like: at least two dot-separated lowercase segments. */
export const FAMILY_ID_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

/**
 * Extracts the family from a test's top-level describe title, or undefined when the title is
 * not a family id. The dashboard files such tests under their literal title.
 */
export const familyOf = (describeTitle: string): string | undefined =>
    FAMILY_ID_PATTERN.test(describeTitle) ? describeTitle : undefined;
