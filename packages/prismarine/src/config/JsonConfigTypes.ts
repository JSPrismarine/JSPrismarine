import type { PlayerProgressJson } from '@jsprismarine/advancements';
import type { LogLevel } from '@jsprismarine/logger';
import type { StoredInventory } from '../inventory/persistence';
import type { StoredSpawnPoint } from '../world/RespawnPoint';

/**
 * One layer of a flat world, bottom first, as the deprecated `layers` key spells it.
 *
 * The replacement is {@link FlatLayerJson}, which calls the same number `height` as Java does.
 */
export interface FlatLayer {
    block: string;
    /** @asType integer @minimum 0 */
    size: number;
}

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
     * The old generator name, `Overworld` or `Flat`.
     * @deprecated Use `preset`: `Overworld` is `minecraft:normal` and `Flat` is `minecraft:flat`.
     */
    generator?: string;
    /**
     * The old flat world layers, read only with `generator: 'Flat'`.
     * @deprecated Use `dimensions['minecraft:overworld'].generator` with a `minecraft:flat`
     * generator whose `settings.layers` spell each layer as `{ block, height }`.
     */
    layers?: FlatLayer[];
}

/** The subset of world settings read by a generator or provider. */
export type WorldConfig = Partial<WorldData>;

/** A difficulty name accepted in `config.json`. */
export type ConfigDifficulty = 'peaceful' | 'easy' | 'normal' | 'hard';

/**
 * Settings supported by the JSON configuration file.
 * @title JSPrismarine server configuration
 */
export interface ConfigFile {
    /** How much the console and the log file say. */
    'log-level'?: LogLevel;
    /** The UDP port the server listens on. Bedrock clients look for 19132. @asType integer @minimum 0 @maximum 65535 */
    port?: number;
    /** The address to listen on. `0.0.0.0` accepts connections on every interface. */
    'server-ip'?: string;
    /** Which entry of `worlds` players join. */
    'level-name'?: string;
    /** Every world the server loads, keyed by its name. @propertyNames {"type":"string","minLength":1} */
    worlds?: Record<string, WorldData>;
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
    /** How long each tick may spend sending chunks, out of its 50 ms. @minimum 0 */
    'chunk-send-budget-ms'?: number;
    /** Whether positional packets only go to nearby players. */
    'proximity-broadcast'?: boolean;
    /** Whether the server times block breaking, as a Bedrock Dedicated Server does. Off leaves it to the client. */
    'server-authoritative-block-breaking'?: boolean;
    /** Chunks past view distance before an entity leaves a player's screen. @minimum 0 */
    'entity-tracking-hysteresis'?: number;
    /** Ticks between entity visibility passes. @asType integer @minimum 1 */
    'entity-tracking-interval'?: number;
    /** Whether players must be signed in to Xbox Live. */
    'online-mode'?: boolean;
    /** The zlib level for outgoing batches. @asType integer @minimum -1 @maximum 9 */
    'packet-compression-level'?: number;
    /** Whether to answer the Minecraft and Source query protocols. */
    'enable-query'?: boolean;
    /** Whether to show the tick rate in the process title. */
    'enable-process-title'?: boolean;
    /** Whether the world ticks. */
    'enable-ticking'?: boolean;
    /** Packet class names kept out of the traffic log at the silly level. */
    'log-excluded-packets'?: string[];
    /** How many recipes to send: -1 for all, 0 for none, or a cap. @asType integer @minimum -1 */
    'crafting-recipe-limit'?: number;
    /** Whether a pack that reports an error stops the server instead of loading short. */
    'content-strict'?: boolean;
    /** Extra behavior pack directories this world loads, after the vanilla ones. */
    'content-world-packs'?: string[];
    /** Java datapack directories this world loads, after the vanilla one. */
    'content-datapacks'?: string[];
}

/** The keys the content build reads before `Config.enable` runs. */
export type ContentConfigKey = 'content-strict' | 'content-world-packs' | 'content-datapacks';

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
    'log-level',
    'port',
    'server-ip',
    'level-name',
    'worlds',
    'max-players',
    'gamemode',
    'difficulty',
    'motd',
    'view-distance',
    'preload-radius',
    'chunk-send-budget-ms',
    'proximity-broadcast',
    'server-authoritative-block-breaking',
    'entity-tracking-hysteresis',
    'entity-tracking-interval',
    'online-mode',
    'packet-compression-level',
    'enable-query',
    'enable-process-title',
    'enable-ticking',
    'log-excluded-packets',
    'crafting-recipe-limit',
    'content-strict',
    'content-world-packs',
    'content-datapacks'
] as const satisfies readonly ('$schema' | keyof ConfigFile)[];

/** Compile-time proof that no `ConfigFile` key is missing from {@link CONFIG_KEY_ORDER}. */
type EveryKeyOrdered = [Exclude<keyof ConfigFile, (typeof CONFIG_KEY_ORDER)[number]>] extends [never] ? true : never;
true satisfies EveryKeyOrdered;

/** One player entry in `permissions.json`. */
export interface PlayerPermissions {
    name: string;
    /** The player's UUID, used to grant permissions independently of their name. */
    uuid: string;
    permissions: string[];
}

/**
 * Permissions granted by default, to operators, and to named players.
 * @title JSPrismarine permissions
 */
export interface PermissionsFile {
    /** Permissions every player has. */
    defaultPermissions?: string[];
    /** Permissions every operator has in addition to the default permissions. */
    defaultOperatorPermissions?: string[];
    /** Permissions granted to individual players. */
    players?: PlayerPermissions[];
}

/** One operator entry in `ops.json`. */
export interface OpEntry {
    name: string;
    /** The player's UUID, used to identify the operator. */
    uuid: string;
    /** Informational operator level; JSPrismarine currently identifies operators by UUID. */
    level?: number;
}

/**
 * Players allowed to use operator commands.
 * @title JSPrismarine operators
 */
export type OpsFile = OpEntry[];

/** One entry in `banned-players.json`. */
export interface BannedPlayerEntry {
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
     * {@link import('../world/RespawnPoint').resolveRespawn} for when a stored point stops
     * being used.
     */
    spawn?: StoredSpawnPoint;
    /**
     * Ticks left before the player may enter a portal again, Bedrock's `PortalCooldown`.
     *
     * Set when a player changes dimension, so logging out inside the arrival portal and back
     * in does not send them straight back. Absent on a record written before this field
     * existed, which reads as no cooldown.
     */
    portalCooldown?: number;
    /**
     * When this record was written, in milliseconds since the epoch.
     *
     * Written so a tool or a later migration can tell two copies of a record apart. Absent on a
     * record written before this field existed. Which world a returning player lands in is
     * `dimension`'s job: see {@link import('../world/PlayerRecords').lastPlayerRecord}.
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
