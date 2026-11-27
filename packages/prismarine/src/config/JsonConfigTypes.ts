import type { PlayerProgressJson } from '@jsprismarine/advancements';
import type { LogLevel } from '@jsprismarine/logger';
import type { SubjectKind } from '../identity/Subject';
import type { StoredInventory } from '../inventory/persistence';
import type { StoredSpawnPoint } from '../world/RespawnPoint';
import type { PlayerDataPart } from '../world/playerDataGroups';
import type { WorldExperiment } from '../world/WorldExperiments';

/** One layer of a `minecraft:flat` generator's `settings.layers`, bottom first, in Java's spelling. */
export interface FlatLayerJson {
    /** The block the layer is made of, as a Java identifier such as `minecraft:stone`. */
    block: string;
    /** How many blocks thick the layer is. @asType integer @minimum 0 @maximum 4064 */
    height: number;
}

/**
 * The `settings` of a `minecraft:flat` generator, the same object a Java
 * `worldgen/flat_level_generator_preset` document carries under `settings`.
 */
export interface FlatGeneratorSettingsJson {
    /** The layers, bottom first. */
    layers: FlatLayerJson[];
    /** The one biome the whole dimension has. Defaults to `minecraft:plains`. */
    biome?: string;
    /** Whether lava lakes generate. Defaults to false. */
    lakes?: boolean;
    /** Whether the biome's placed features generate. Defaults to false. */
    features?: boolean;
    /** The structure sets that place structures. Absent means every registered set, `[]` means none. */
    structure_overrides?: string | string[];
}

/**
 * A level stem's `generator` object, written as a Java `dimension` document writes it.
 *
 * `type` is the generator kind. The other keys belong to the kind: `minecraft:noise` reads
 * `settings` and `biome_source`, `minecraft:flat` reads `settings` as its layers and flags,
 * and `minecraft:debug` has none.
 */
export interface GeneratorDefinitionJson {
    /** The generator kind, for example `minecraft:noise` or `minecraft:flat`. */
    type: string;
    /**
     * The kind's settings: a `worldgen/noise_settings` id or inline document for
     * `minecraft:noise`, the layers for `minecraft:flat`.
     */
    settings?: string | FlatGeneratorSettingsJson | Record<string, unknown>;
    /** The biome layout of a `minecraft:noise` generator, as Java's `biome_source` object. */
    biome_source?: Record<string, unknown>;
}

/**
 * What a world says about one of its dimensions, keyed under `WorldData.dimensions` by the
 * Java dimension id such as `minecraft:the_nether`.
 *
 * An entry for an id the preset has overrides that stem; an entry for a new id adds a
 * dimension. A key left out comes from the preset's stem.
 */
export interface DimensionConfig {
    /** The Java `dimension_type` id. Defaults to the preset's. */
    type?: string;
    /** The level stem generator. Defaults to the preset's. */
    generator?: GeneratorDefinitionJson;
    /** `eager` builds the dimension's world at startup; `lazy`, the default, on first entry. */
    load?: 'eager' | 'lazy';
}

/** One group of `player-data-groups`: its levels, and the parts of a player's record they share. */
export interface PlayerDataGroupConfig {
    /** The levels in the group, by name. */
    levels: string[];
    /** The parts their players share; every other part stays per level. */
    share: PlayerDataPart[];
}

/** The configuration saved for one world. */
export interface WorldData {
    /**
     * The world seed, read the way Java reads the text in its world creation box: a value that
     * parses as a 64-bit integer is that integer, and anything else is its `String.hashCode`.
     *
     * Spell it as a string. A Java seed is a 64-bit integer and a JSON or YAML number is a
     * double, which is exact only below 2^53. Written as a number, `8475011743740320021` is
     * read back as `8475011743740319744` and generates a different world. A number is still
     * accepted for configs written before this, and is exact for seeds below 2^53.
     */
    seed: string | number;
    provider?: string;
    /**
     * The Java `worldgen/world_preset` id that supplies the dimensions and their generators.
     * @default 'minecraft:normal'
     */
    preset?: string;
    /** Per-dimension overrides of the preset's stems, and dimensions the preset lacks. */
    dimensions?: Record<string, DimensionConfig>;
    /**
     * Bedrock experiments to turn on, by the id `level.dat` keeps them under. `gametest` is Beta
     * APIs, which a behavior pack script needs to declare a beta Script API version. An
     * experiment the world's `level.dat` already has on stays on.
     */
    experiments?: WorldExperiment[];
}

/** The subset of world settings read by a generator or provider. */
export type WorldConfig = Partial<WorldData>;

/** A difficulty name accepted in `config.json`. */
export type ConfigDifficulty = 'peaceful' | 'easy' | 'normal' | 'hard';

/** The `stats.bstats` section: whether the server reports to bStats, and what the reports log. */
export interface BStatsConfig {
    /** Whether the server sends pseudonymous usage data to bStats. */
    enabled?: boolean;
    /** Whether a failed submit is logged. */
    'log-errors'?: boolean;
    /** Whether each submitted payload is logged. */
    'log-sent-data'?: boolean;
    /** Whether the text bStats answers a submit with is logged. */
    'log-response-status-text'?: boolean;
    /** The URL reports are posted to: bStats' own by default, or a bStats instance of your own. @pattern ^https?:// */
    endpoint?: string;
}

/** The `updates` section: whether and how the server checks for a newer JSPrismarine. Unset keys follow the build. */
export interface UpdatesConfig {
    /** Whether the server checks for updates. Unset, it does unless it runs from a checkout. */
    enabled?: boolean;
    /** Which builds to hear about: `release` or `nightly`. Unset, the channel of the running build. */
    channel?: 'release' | 'nightly';
    /** Where the feed is: `owner/repo`, or the https URL of a folder that holds the feed files. */
    source?: string;
    /** Minutes between checks; values under 60 read as 60. @asType integer @minimum 60 */
    interval?: number;
}

/** The `stats` section: one entry per service the server reports usage statistics to. */
export interface StatsConfig {
    /** bStats, at https://bstats.org. */
    bstats?: BStatsConfig;
}

/**
 * Settings supported by the JSON configuration file.
 * @title JSPrismarine server configuration
 */
export interface ConfigFile {
    /** The layout of this file. The server upgrades a file with an older one, or without one. @asType integer */
    schemaVersion?: 1;
    /** How much the console and the log file say. */
    'log-level'?: LogLevel;
    /** The port the server listens on, as Bedrock Dedicated Server's `server-port`: TCP for NetherNet signaling, and UDP for RakNet and NetherNet. @asType integer @minimum 0 @maximum 65535 */
    'server-port'?: number;
    /** The UDP port RakNet listens on for IPv6 clients when `server-ip` is `0.0.0.0`. Bedrock clients look for 19133. @asType integer @minimum 0 @maximum 65535 */
    'server-portv6'?: number;
    /** The address to listen on. `0.0.0.0` accepts connections on every interface. */
    'server-ip'?: string;
    /** Which entry of `worlds` players join. */
    'level-name'?: string;
    /** Every world the server loads, keyed by its name. @propertyNames {"type":"string","minLength":1} */
    worlds?: Record<string, WorldData>;
    /** Groups of levels whose players share parts of their record, by group name. */
    'player-data-groups'?: Record<string, PlayerDataGroupConfig>;
    /** How many players may be online at once. @asType integer @minimum 0 */
    'max-players'?: number;
    /** The default game mode for new players. */
    gamemode?: string;
    /** How dangerous the monsters are. */
    difficulty?: ConfigDifficulty;
    /** The message shown in the server list. */
    motd?: string;
    /** How far players see, in chunks. @minimum 0 */
    'view-distance'?: number;
    /** How many chunks around spawn to generate before accepting players. 0 skips it. @minimum 0 */
    'preload-radius'?: number;
    /** How many worker threads to use for chunk generation. 0 keeps generation on the server thread. @asType integer @minimum 0 */
    'chunk-workers'?: number;
    /** Where chunk generation workers run: a separate low-priority process, or threads in the server process. */
    'chunk-host'?: 'process' | 'in-process';
    'terrain-cache-size-mb'?: number;
    /** How long each tick may spend sending chunks, out of its 50 ms. @minimum 0 */
    'chunk-send-budget-ms'?: number;
    /** Whether positional packets only go to nearby players. */
    'proximity-broadcast'?: boolean;
    /** Whether the server times block breaking, as a Bedrock Dedicated Server does. Off leaves it to the client. */
    'server-authoritative-block-breaking'?: boolean;
    /** Which edition decides what flowing water and lava wash away. */
    'fluid-replacement'?: 'java' | 'bedrock';
    /** Chunks past view distance before an entity leaves a player's screen. @minimum 0 */
    'entity-tracking-hysteresis'?: number;
    /** Ticks between entity visibility passes. @asType integer @minimum 1 */
    'entity-tracking-interval'?: number;
    /** Seconds between the pings that check a client is still there, for both editions; 0 sends none. @minimum 0 */
    'keep-alive-interval'?: number;
    /** How many Bedrock releases to accept, counted back from the newest this server supports. @asType integer @minimum 1 */
    'protocol-window'?: number;
    /** Which release in the protocol window the world's content comes from: the newest, or the oldest so every accepted client has all of it. */
    'protocol-content'?: 'newest' | 'oldest';
    /** Whether only the players in `allowlist.json` may join. */
    'allow-list'?: boolean;
    /** Whether players must be signed in: Bedrock players to Xbox Live, Java Edition players to Mojang's session server. */
    'online-mode'?: boolean;
    /** Whether to accept clients over RakNet, Bedrock's UDP transport before NetherNet. */
    'enable-raknet'?: boolean;
    /** Whether RakNet UDP I/O and reliability updates run in a worker thread. */
    'use-raknet-worker'?: boolean;
    /** Whether to accept clients over NetherNet, the WebRTC transport Bedrock Dedicated Server defaults to. */
    'enable-nethernet'?: boolean;
    /** Whether a Java Edition account and an Xbox account can be linked into one player. */
    'account-linking'?: boolean;
    /** Whether to answer Java Edition clients on `java-port`. */
    'java-enabled'?: boolean;
    /** The TCP port Java Edition clients connect to. */
    'java-port'?: number;
    /** The UDP ports NetherNet players use, as Bedrock Dedicated Server's `server-udp-ports`: a port or a range, each optionally a `public:local` mapping. */
    'server-udp-ports'?: string;
    /** The address NetherNet advertises, as Bedrock Dedicated Server's `server-public-ip`: a raw IPv4, a raw or bracketed IPv6, or empty. */
    'server-public-ip'?: string;
    /** Whether NetherNet looks up the public address to offer when `server-public-ip` is empty. */
    'enable-server-public-ip-lookup'?: boolean;
    /** Whether players on the local network see the server among their LAN games, as Bedrock Dedicated Server's `enable-lan-visibility`. */
    'enable-lan-visibility'?: boolean;
    /** The zlib level for outgoing batches. @asType integer @minimum -1 @maximum 9 */
    'packet-compression-level'?: number;
    /** The batch compression algorithm advertised in `NetworkSettings`. */
    'packet-compression-algorithm'?: 'zlib' | 'snappy' | 'none';
    /** The minimum batch-body size to compress, in bytes. Zero disables compression. @asType integer @minimum 0 @maximum 65535 */
    'packet-compression-threshold'?: number;
    /** Whether to use the unvalidated, experimental cached full-flush batch fragments. */
    'packet-full-flush-fragments'?: boolean;
    /** Whether to answer the GameSpy4 query protocol that server lists and status tools use. */
    'enable-query'?: boolean;
    /** The UDP port the query protocol answers on; `server-port`, on the RakNet socket, when unset. @asType integer @minimum 0 @maximum 65535 */
    'query-port'?: number;
    /** Whether to show the tick rate in the process title. */
    'enable-process-title'?: boolean;
    /** Whether the world ticks. */
    'enable-ticking'?: boolean;
    /** Packet class names kept out of the traffic log at the silly level. */
    'log-excluded-packets'?: string[];
    /** How many recipes to send: -1 for all, 0 for none, or a cap. @asType integer @minimum -1 */
    'crafting-recipe-limit'?: number;
    /** Whether a player must take the installed addons' resource packs to join, as Bedrock Dedicated Server's `texturepack-required`. */
    'texturepack-required'?: boolean;
    /** The services the server reports pseudonymous usage statistics to. */
    stats?: StatsConfig;
    /** Whether and how the server checks for a newer JSPrismarine. */
    updates?: UpdatesConfig;
    /** Whether a hang, a stack overflow or running out of memory in a script shuts the server down. */
    'script-watchdog-enable-shutdown'?: boolean;
    /** How long one script callback may run before it is stopped, in milliseconds, converted to steps. @asType integer @minimum 1 */
    'script-watchdog-hang-threshold'?: number;
    /** How many megabytes the scripts of one world may allocate together; 0 for no limit. @asType integer @minimum 0 */
    'script-watchdog-memory-limit'?: number;
    /** Whether `/script debugger listen` and auto-attach's listen mode may open a port for the script debugger. */
    'allow-inbound-script-debugging'?: boolean;
    /** Whether `/script debugger connect` and auto-attach's connect mode may connect to a script debugger. */
    'allow-outbound-script-debugging'?: boolean;
    /** The one port the script debugger listens on; `/script debugger listen` then takes none. @asType integer @minimum 1 @maximum 65535 */
    'force-inbound-debug-port'?: number;
    /** The address the script debugger listens on; one other than loopback needs a passcode. */
    'script-debugger-listen-address'?: string;
    /** Whether the script debugger attaches when the scripts load: `disabled`, `connect` or `listen`. */
    'script-debugger-auto-attach'?: 'disabled' | 'connect' | 'listen';
    /** Where auto-attach's connect mode finds the debugger, as `host:port`. */
    'script-debugger-auto-attach-connect-address'?: string;
    /** How many seconds the server waits for an auto-attached debugger. @asType integer @minimum 0 */
    'script-debugger-auto-attach-timeout'?: number;
    /** The passcode the script debugger must send; empty for none. */
    'script-debugger-passcode'?: string;
    /** Whether a pack that reports an error stops the server instead of loading short. */
    'content-strict'?: boolean;
    /** Extra behavior pack directories this world loads, after the vanilla ones. */
    'content-world-packs'?: string[];
    /** Java datapack directories this world loads, after the vanilla one. */
    'content-datapacks'?: string[];
    /** The pinned Java release whose data the server loads; empty for the default release. */
    'content-java-version'?: string;
}

/**
 * The keys the content build reads before `Config.enable` runs. The protocol keys are among them
 * because `protocol-content: oldest` decides which vanilla content the build leaves out.
 */
export type ContentConfigKey =
    | 'protocol-window'
    | 'protocol-content'
    | 'content-strict'
    | 'content-world-packs'
    | 'content-datapacks'
    | 'content-java-version';

/**
 * Every key `config.json` may hold, in the order the file spells them.
 *
 * The file is written one key at a time, by whichever part of the server asks
 * first - the watch-mode host reads the content keys before the child's
 * `Config` exists - so the order cannot come from write order. A new key is
 * inserted where this list says it goes, which keeps the file in definition
 * order no matter who writes it, and keeps `$schema` first.
 */
export const CONFIG_KEY_ORDER = [
    '$schema',
    'schemaVersion',
    'log-level',
    'server-port',
    'server-portv6',
    'server-ip',
    'level-name',
    'worlds',
    'player-data-groups',
    'max-players',
    'gamemode',
    'difficulty',
    'motd',
    'view-distance',
    'preload-radius',
    'chunk-workers',
    'chunk-host',
    'terrain-cache-size-mb',
    'chunk-send-budget-ms',
    'proximity-broadcast',
    'server-authoritative-block-breaking',
    'fluid-replacement',
    'entity-tracking-hysteresis',
    'entity-tracking-interval',
    'keep-alive-interval',
    'protocol-window',
    'protocol-content',
    'allow-list',
    'online-mode',
    'enable-raknet',
    'use-raknet-worker',
    'enable-nethernet',
    'java-enabled',
    'java-port',
    'account-linking',
    'server-udp-ports',
    'server-public-ip',
    'enable-server-public-ip-lookup',
    'enable-lan-visibility',
    'packet-compression-level',
    'packet-compression-algorithm',
    'packet-compression-threshold',
    'packet-full-flush-fragments',
    'enable-query',
    'query-port',
    'enable-process-title',
    'enable-ticking',
    'log-excluded-packets',
    'crafting-recipe-limit',
    'texturepack-required',
    'stats',
    'updates',
    'script-watchdog-enable-shutdown',
    'script-watchdog-hang-threshold',
    'script-watchdog-memory-limit',
    'allow-inbound-script-debugging',
    'allow-outbound-script-debugging',
    'force-inbound-debug-port',
    'script-debugger-listen-address',
    'script-debugger-auto-attach',
    'script-debugger-auto-attach-connect-address',
    'script-debugger-auto-attach-timeout',
    'script-debugger-passcode',
    'content-strict',
    'content-world-packs',
    'content-datapacks',
    'content-java-version'
] as const satisfies readonly ('$schema' | keyof ConfigFile)[];

/** Compile-time proof that no `ConfigFile` key is missing from {@link CONFIG_KEY_ORDER}. */
type EveryKeyOrdered = [Exclude<keyof ConfigFile, (typeof CONFIG_KEY_ORDER)[number]>] extends [never] ? true : never;
true satisfies EveryKeyOrdered;

/** One node a group or a user holds. */
export interface PermissionNodeJson {
    /** `scope.name`, `scope.*` for a whole scope, `*` for everything; a leading `-` negates. */
    node: string;
    /** When the node stops applying, as ISO 8601. Absent for never. @format date-time */
    expires?: string;
}

/** A user's membership in a group. */
export interface PermissionMembershipJson {
    /** The group's name, a key of `groups`. */
    group: string;
    /** When the membership ends, as ISO 8601. Absent for never. @format date-time */
    expires?: string;
}

/** A group: what every member holds. */
export interface PermissionGroupJson {
    /** A heavier group decides before a lighter one. `default` is 0 and `operator` is 100 on a fresh file. */
    weight: number;
    /** Groups this one inherits, visited depth first after its own nodes. */
    parents: string[];
    nodes: PermissionNodeJson[];
    /** `prefix`, `suffix`, `level` (0 to 4, the command level) or anything else a pack reads. */
    meta: Record<string, string>;
}

/** A user: one subject's own memberships, nodes and meta. */
export interface PermissionUserJson {
    /** The player's name when last seen, for reading the file. The key decides who it is. */
    name: string;
    /** The groups the user holds directly. Everyone holds `default`, and an operator `operator`. */
    groups: PermissionMembershipJson[];
    /** The user's own nodes, which decide before any group's. */
    nodes: PermissionNodeJson[];
    /** The user's own meta, which decides before any group's. */
    meta: Record<string, string>;
}

/** A user migrated from a file that keyed players by login UUID, waiting for a login with that UUID. */
export interface PendingPermissionUserJson extends PermissionUserJson {
    /** The login UUID the entry was keyed by. The login that carries it files the user under its subject. */
    legacyUuid: string;
}

/**
 * Groups and users, with users filed under one section per platform.
 * @title JSPrismarine permissions
 */
export interface PermissionsFile {
    /** The layout of this file. The server upgrades a file with an older one, or without one. @asType integer */
    schemaVersion: 3;
    /** Every group by name. A fresh or migrated file writes `default` and `operator`; a file without one reads as if it had a fresh file's. */
    groups: Record<string, PermissionGroupJson>;
    /** Users by platform: `xbox` by XUID, `java` by Mojang profile UUID, `offline` by name. */
    users: Partial<Record<SubjectKind, Record<string, PermissionUserJson>>>;
    /** Users still keyed by a login UUID, until the login with it claims each. */
    pending?: PendingPermissionUserJson[];
}

/**
 * The fields that say which player an entry is about, as `ops.json` and `banned-players.json`
 * spell a subject: the platform, and the player's id on it.
 */
export interface SubjectEntry {
    /**
     * Which platform `id` belongs to: `xbox` for an Xbox Live XUID, `java` for a Mojang profile
     * UUID, `offline` for a name on an offline-mode server.
     */
    kind: SubjectKind;
    /** The player's id on that platform: the XUID, the UUID or the name. */
    id: string;
}

/** One operator entry in `ops.json`. */
export interface OpEntry extends Partial<SubjectEntry> {
    /** The player's name when the entry was written. `kind` and `id` decide who it is. */
    name: string;
    /**
     * The login UUID an entry written before `kind` and `id` existed was keyed by. The entry waits
     * for a login with this UUID, which writes `kind` and `id` and drops it.
     */
    uuid?: string;
    /** Informational operator level; an operator runs every command at level 4. */
    level?: number;
}

/**
 * Players allowed to use operator commands.
 * @title JSPrismarine operators
 */
export type OpsFile = OpEntry[];

/**
 * One entry in `banned-players.json`. An entry with `kind` and `id` bans that one player; an entry
 * with a name alone, as the file was written before `kind` and `id` existed, bans every player of
 * that name until one logs in and the entry is written with their `kind` and `id`.
 */
export interface BannedPlayerEntry extends Partial<SubjectEntry> {
    /** The player's exact name. */
    name: string;
    /** The reason shown to the player, if provided. */
    reason?: string;
}

/**
 * Players prevented from joining the server.
 * @title JSPrismarine banned players
 */
export type BannedPlayersFile = BannedPlayerEntry[];

/**
 * Legacy shape imported once from older worlds' `level.json` files.
 * @title JSPrismarine world level data
 * @deprecated World state is stored by the world provider.
 */
export interface LevelData {
    spawn?: { x: number; y: number; z: number };
    gameRules?: Array<[string, [boolean | number, boolean]]>;
    /**
     * Java's `WeatherData`: the three counters and the two flags.
     *
     * Unknown rather than a record type, because what is in the file is whatever was last
     * written there; `savedWeatherOf` is the check that turns it into a record.
     */
    weather?: unknown;
    entities?: Array<{
        type: string;
        position: {
            x: number;
            y: number;
            z: number;
            pitch?: number;
            yaw?: number;
            headYaw?: number;
        };
    }>;
}

/**
 * Player state saved by a world provider, or in a JSON fallback file.
 * @title JSPrismarine fallback player data
 */
export interface WorldPlayerData {
    /** Written so the file says who it belongs to; the file is found by key, not by this. */
    uuid?: string;
    /** Written for the same reason as `uuid`. */
    username?: string;
    /** The saved game mode, normally Survival, Creative, Adventure, or Spectator. */
    gamemode: string;
    /** Whether the player was flying when this record was saved. */
    flying?: boolean;
    position: {
        x: number;
        y: number;
        z: number;
        pitch: number;
        yaw: number;
        headYaw: number;
    };
    /**
     * The Java id of the dimension the player was in, such as `minecraft:the_nether`.
     *
     * The LevelDB provider also writes it as Bedrock's `DimensionId` integer. Absent on a
     * record written before this field existed, which reads as the Overworld.
     */
    dimension?: string;
    /**
     * Advancement progress: advancement id to the criteria the player has
     * completed, each with the instant it was granted.
     *
     * Stored here rather than in a file of its own so that whatever a provider
     * does with player data - the LevelDB provider writes a `player_server_`
     * record, the file provider a JSON file - carries the progress with it.
     */
    advancements?: PlayerProgressJson;
    /**
     * The player's enchantment seed.
     *
     * Java drives all three rows of an enchanting table from one generator
     * seeded with this, which is what keeps the rows still while a player puts
     * an item in and takes it out again. Kept across a login for the same
     * reason: a table that redrew on every join would be a different table.
     */
    enchantmentSeed?: number;
    /**
     * Everything the player was carrying: the 36 main slots, the hand slot, the four armor
     * slots, the off hand and the 27 ender chest slots.
     *
     * Absent until this was written, so a logout threw away every item a player held along
     * with its durability, its name and its enchantments.
     */
    inventory?: StoredInventory;
    /** Half-hearts, out of the player's maximum. */
    health?: number;
    /** The food bar, out of twenty. */
    food?: number;
    /** The hidden buffer that is spent before food is. */
    saturation?: number;
    /**
     * Experience, as the two numbers Bedrock carries: whole levels, and how far along the
     * current level the bar is.
     */
    experience?: {
        level: number;
        progress: number;
    };
    /**
     * Every live attribute, keyed by its namespaced identifier.
     *
     * Keeping the definition beside the value lets the player record preserve attributes
     * added by content without teaching the provider a new field for each one.
     */
    attributes?: Readonly<Record<string, StoredPlayerAttribute>>;
    /**
     * Where this player comes back after a death, or absent for the world spawn.
     *
     * Nothing modeled one before this: every respawn answered with the world spawn, which is
     * also why `/spawnpoint` was left out of the command registry. See
     * `resolveRespawn` for when a stored point stops
     * being used.
     */
    spawn?: StoredSpawnPoint;
    /**
     * The actor record tags this server does not model, as network NBT in base64: a script's
     * `DynamicProperties` live there, as they do on the player's actor on Bedrock Dedicated
     * Server. Absent when the player has none. The LevelDB provider writes the tags at the
     * record's root, where the game keeps them; this form is the fallback JSON file's.
     */
    persistentNbt?: string;
    /**
     * Ticks left before the player may enter a portal again, Bedrock's `PortalCooldown`.
     *
     * Set when a player changes dimension, so logging out inside the arrival portal and back
     * in does not send them straight back. Absent on a record written before this field
     * existed, which reads as no cooldown.
     */
    portalCooldown?: number;
    /**
     * Whether this player has watched the end credits, Bedrock's `HasSeenCredits`.
     *
     * Set when the credits start rolling on a first exit through the End's portal, so a later
     * exit transfers at once. Absent on a record written before this field existed, which
     * reads as not seen.
     */
    seenCredits?: boolean;
    /**
     * Ticks since this player last slept or died, Java's `Stats.TIME_SINCE_REST` and Bedrock's
     * `TimeSinceRest`. Absent on a record written before this field existed, which reads as 0.
     *
     * @javaSee Stats.TIME_SINCE_REST
     */
    timeSinceRest?: number;
    /**
     * When this record was written, in milliseconds since the epoch.
     *
     * Written so a tool or a later migration can tell two copies of a record apart. Absent on a
     * record written before this field existed. Which world a returning player lands in is
     * `dimension`'s job: see `lastPlayerRecord`.
     */
    savedAt?: number;
}

/** The live definition and value of one player attribute at save time. */
export interface StoredPlayerAttribute {
    readonly min: number;
    readonly max: number;
    readonly base: number;
    readonly current: number;
}
