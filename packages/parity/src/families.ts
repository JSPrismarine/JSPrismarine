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
    /** The protocol 2225 item table against the 1.26.60 capture it is built from. */
    registryItems2225: 'registry.items-2225',
    /** The advertised actor types against the entity identifiers golden. */
    registryEntities: 'registry.entities',
    /** Biome names and numeric ids against the biome definitions golden. */
    registryBiomes: 'registry.biomes',

    /** Chunker's totality property over every Java block state (plan section 5). */
    mappingBlocks: 'mapping.blocks',
    /** Chunker's totality property over Java's item registry. */
    mappingItems: 'mapping.items',
    /** Chunker's totality property over Java's entity type registry. */
    mappingEntities: 'mapping.entities',
    /** Chunker's totality property over the four mapped registries beyond block, item and entity. */
    mappingRegistries: 'mapping.registries',
    /** The registries that reach a client with no published Java-to-Bedrock pairing to map them by. */
    mappingUntranslated: 'mapping.untranslated',
    /** What a Java block entity's contents lose on the way into the Bedrock block entity. */
    mappingBlockEntities: 'mapping.blockentities',

    /** The per-state block property table against the Java 26.3 jar dump (phase 1 exit). */
    blocksProperties: 'blocks.properties',

    /** The item type table's Java-sourced components against the Bedrock item capture (phase 1 exit). */
    itemsComponents: 'items.components',

    /** Java's vanilla recipe files, by recipe id, through the recipe evaluator (phase 2 exit). */
    recipesRegistry: 'recipes.registry',

    /** Java's vanilla loot tables, by structure, through the loot evaluator (phase 2 exit). */
    lootTables: 'loot.tables',
    /** Rolled item counts against the distribution each table's own weights predict (phase 2 exit). */
    lootDistribution: 'loot.distribution',

    /** Entity stats against the Java attribute dump for each mapped mob (phase 3 exit). */
    entitiesStats: 'entities.stats',
    /** The `AddActorPacket` payload per advertised actor type (phase 3 exit). */
    entitiesAddActor: 'entities.addactor',

    /** Java and Bedrock tag data through the resolved runtime registries. */
    integrationTags: 'integration.tags',
    /** A representative vanilla data-driven entity through an event, tick, and physics step. */
    integrationEntityRuntime: 'integration.entity-runtime',
    /** Every Bedrock entity declaration resolved and exercised by the data-driven runtime. */
    integrationEntityCoverage: 'integration.entity-coverage',
    /** Registry, creative, and crafting payloads built for a joining Bedrock client. */
    integrationClientPackets: 'integration.client-packets',

    /** The multi-noise biome source against Java's biome parameter vectors (phase 4 exit). */
    worldgenBiomes: 'worldgen.biomes',
    /** Heightmap and terrain class for the reference region against Java's column dump (phase 4 exit). */
    worldgenTerrain: 'worldgen.terrain',
    /** Ore and feature counts against a measured distribution (phase 4 exit). */
    worldgenFeatures: 'worldgen.features',
    /** Every corpus chunk's blocks, biomes, heightmap and block entities against the golden. */
    worldgenCorpus: 'worldgen.corpus',
    /** Structure placements and their boxes against the golden the corpus scan captured. */
    worldgenStructures: 'worldgen.structures',
    /** The same chunk, generated twice and in different orders, is the same chunk. */
    worldgenDeterminism: 'worldgen.determinism',

    /** The command tree the server publishes against Mojang's Bedrock command metadata (phase 5). */
    commandsTree: 'commands.tree',

    /** Every registered protocol version negotiates its own codec from a real first packet. */
    protocolNegotiation: 'protocol.negotiation',
    /** Declarative wire layouts re-encode a real server's bytes exactly, per protocol version. */
    protocolWireRoundtrip: 'protocol.wire-roundtrip',

    /** The public parity claim stays in step with the research note it cites. */
    conformanceClaim: 'conformance.claim',
    /** The classification table the claim counts stays in step with the research note. */
    conformanceClassification: 'conformance.classification',
    /** One negative check per excluded category: the project does not claim it. */
    conformanceExclusions: 'conformance.exclusions'
} as const;

/** One of the family ids in {@link FAMILIES}. */
export type Family = (typeof FAMILIES)[keyof typeof FAMILIES];

/** Every declared family id, in declaration order. */
export const ALL_FAMILIES: readonly Family[] = Object.values(FAMILIES);

/**
 * The group each family id starts with, deduplicated and sorted. Derived from {@link FAMILIES}
 * rather than written out, so a new family extends the group list by existing.
 */
export const FAMILY_GROUPS: readonly string[] = [
    ...new Set(ALL_FAMILIES.map((family) => family.slice(0, family.indexOf('.'))))
].sort();

/** What a family id looks like: at least two dot-separated lowercase segments. */
export const FAMILY_ID_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

/**
 * Extracts the family from a test's top-level describe title, or undefined when the title is
 * not a family id. The dashboard files such tests under their literal title.
 */
export const familyOf = (describeTitle: string): string | undefined =>
    FAMILY_ID_PATTERN.test(describeTitle) ? describeTitle : undefined;
