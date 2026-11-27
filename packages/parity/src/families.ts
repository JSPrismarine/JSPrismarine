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
    /** The preview protocol's item table against the BDS preview capture it is built from. */
    registryItems2259: 'registry.items-2259',
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
    /** The portal, frame and lighting blocks the portal rules name, with the states they read, against the palette capture. */
    blocksPortals: 'blocks.portals',

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
    /** Java entity-specific runtime behavior coverage, listed separately from registry and packet data. */
    entitiesBehavior: 'entities.behavior',

    /** Java and Bedrock tag data through the resolved runtime registries. */
    integrationTags: 'integration.tags',
    /** Vanilla block behaviors write states accepted by the Bedrock block catalog. */
    integrationBlockBehaviors: 'integration.block-behaviors',
    /** Java block runtime behavior coverage, listed separately from block data comparisons. */
    blocksBehavior: 'blocks.behavior',
    /** Java item runtime behavior coverage, listed separately from item data comparisons. */
    itemsBehavior: 'items.behavior',
    /** A representative vanilla data-driven entity through an event, tick, and physics step. */
    integrationEntityRuntime: 'integration.entity-runtime',
    /** The composed vanilla spawn rules through the natural spawn loop. */
    integrationSpawning: 'integration.spawning',
    /** Every Bedrock entity declaration resolved and exercised by the data-driven runtime. */
    integrationEntityCoverage: 'integration.entity-coverage',
    /** Registry, creative, and crafting payloads built for a joining Bedrock client. */
    integrationClientPackets: 'integration.client-packets',
    /** Bedrock pack layers compose to the same active definitions as loading each layer in order. */
    packsComposition: 'packs.composition',

    /** The default Java release's vanilla datapack through the loader, against its own reports. */
    datapack26_3: 'datapack.26.3',
    /**
     * The Java preview's vanilla datapack through the loader, against its own reports. The family
     * follows the preview: a new preview replaces it, as the java-bringup skill says.
     */
    datapack26_4Pre1: 'datapack.26.4-pre-1',

    /** The multi-noise biome source against Java's biome parameter vectors (phase 4 exit). */
    worldgenBiomes: 'worldgen.biomes',
    /** The Java climate-selected spawn chunk across representative world seeds. */
    worldgenSpawn: 'worldgen.spawn',
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
    /** Java's dimension types, presets and stems through the parsers, and one chunk per vanilla dimension. */
    worldgenDimensions: 'worldgen.dimensions',
    /** New terrain generated beside old chunks meets them the way Java's world blender bends it. */
    worldgenBlending: 'worldgen.blending',

    /** The command tree the server publishes against Mojang's Bedrock command metadata (phase 5). */
    commandsTree: 'commands.tree',
    /** How the console answers a command line, against the pinned Bedrock Dedicated Server's answers. */
    commandsAnswers: 'commands.answers',

    /** The End crystal, dragon, spike, and podium data the respawn fight reads. */
    gameplayEndFight: 'gameplay.end-fight',
    /** Sniffer digging, warden sonic-boom damage, and villager raid host effects. */
    gameplayBrainEffects: 'gameplay.brain-effects',
    /**
     * When a store entity's damage commit is heard, which is when Java's `player_hurt_entity` and
     * `player_killed_entity` advancement triggers fire: inside the blow, before a death removes it.
     */
    gameplayCombatAdvancements: 'gameplay.combat-advancements',
    /** The raider table and wave counts the village raid manager spawns from. */
    gameplayRaids: 'gameplay.raids',
    /** Every entry of Java's vanilla datapack registries, by whether the server loads it. */
    gameplayDatapack: 'gameplay.datapack',
    /**
     * Every Java game rule's effect, mob effect, enchantment effect, damage type and player or
     * world system, and the villager professions' trade tables, against what Java does.
     */
    gameplayMechanics: 'gameplay.mechanics',
    /**
     * A block position a client's packet names, refused out of reach or in a chunk that is not
     * loaded, and never loaded to answer it, in the order Java's packet listener checks.
     */
    gameplayBlockTargets: 'gameplay.block-targets',

    /** Every registered protocol version negotiates its own codec from a real first packet. */
    protocolNegotiation: 'protocol.negotiation',
    /** Declarative wire layouts re-encode a real server's bytes exactly, per protocol version. */
    protocolWireRoundtrip: 'protocol.wire-roundtrip',
    /** The packet sequence a world change sends round-trips through every registered codec. */
    protocolDimensionChange: 'protocol.dimension-change',
    /**
     * What a Java Edition client can do on the server and is shown of the world, one row per
     * behavior, through the server's Java packet handlers and presenter.
     */
    protocolJavaClient: 'protocol.java-client',

    /**
     * When behavior pack scripts run against the pinned Bedrock Dedicated Server: module top
     * level, promise jobs, `startup`, `worldInitialize`, `worldLoad` and system tasks, for each
     * `@minecraft/server` major version.
     */
    scriptingLifecycle: 'scripting.lifecycle',
    /** Which before-events and after-events a script receives, in what order, and what they carry. */
    scriptingEvents: 'scripting.events',
    /** The JavaScript engine a script sees: its globals, its language level and its error messages. */
    scriptingEngine: 'scripting.engine',
    /** `@minecraft/server-ui` forms: the form JSON a client receives and the responses a script reads. */
    scriptingUi: 'scripting.ui',
    /** What a script reads and runs of the world, its dimensions and its players, and the system's own events. */
    scriptingWorld: 'scripting.world',
    /** What a script reads and changes of an entity or a player, and of its inventory. */
    scriptingEntities: 'scripting.entities',
    /** What a script reads and sets of a block and its permutation. */
    scriptingBlocks: 'scripting.blocks',
    /** The item stacks a script makes, and what it reads and writes on them. */
    scriptingItems: 'scripting.items',
    /** `@minecraft/server-gametest`: when a GameTest runs, how it ends, and what its simulated players do. */
    scriptingGametest: 'scripting.gametest',
    /** Custom commands a script registers: the command tree, the callbacks' arguments and the results their senders get. */
    scriptingCommands: 'scripting.commands',
    /** Custom block and item components a script registers, and the hooks a pack's blocks and items run them through. */
    scriptingComponents: 'scripting.components',
    /** `@minecraft/server-net`: the HTTP requests a script builds and sends, and what their promises settle with. */
    scriptingNet: 'scripting.net',
    /** `@minecraft/server-admin`: the variables and secrets a pack's config folder gives it, and the player transfers it makes. */
    scriptingAdmin: 'scripting.admin',
    /** `@minecraft/debug-utilities`: the debug shapes a script makes, what they keep and how the drawer counts their time down. */
    scriptingDebug: 'scripting.debug',

    /**
     * Each Java method or field a `@javaSource` tag names, against the fingerprint of its bytecode
     * the golden records for the pinned jar.
     */
    javaTranscriptions: 'java.transcriptions',

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

/** Whether a string is one of the declared family ids. */
export const isFamily = (value: string): value is Family => ALL_FAMILIES.some((family) => family === value);

/**
 * The group each family id starts with, deduplicated and sorted. Derived from {@link FAMILIES}
 * rather than written out, so a new family extends the group list by existing.
 */
export const FAMILY_GROUPS: readonly string[] = [
    ...new Set(ALL_FAMILIES.map((family) => family.slice(0, family.indexOf('.'))))
].sort();

/**
 * What a family id looks like: at least two dot-separated lowercase segments. Segments after the
 * group may start with a digit, so a release id such as `26.4-snapshot-10` can be the domain.
 */
export const FAMILY_ID_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/;

/**
 * Extracts the family from a test's top-level describe title, or undefined when the title is
 * not a family id. The dashboard files such tests under their literal title.
 */
export const familyOf = (describeTitle: string): string | undefined =>
    FAMILY_ID_PATTERN.test(describeTitle) ? describeTitle : undefined;
