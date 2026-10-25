import type { PlayerProgressJson } from '@jsprismarine/advancements';
import type { LogLevel } from '@jsprismarine/logger';

/** One layer of a flat world, bottom first. */
export interface FlatLayer {
    block: string;
    /** @asType integer @minimum 0 */
    size: number;
}

/** The configuration saved for one world. */
export interface WorldData {
    seed: number;
    provider?: string;
    generator?: string;
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
}

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
 * Data written to a world's `level.json` file.
 * @title JSPrismarine world level data
 */
export interface LevelData {
    spawn?: { x: number; y: number; z: number };
    gameRules?: Array<[string, [boolean | number, boolean]]>;
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
    position: {
        x: number;
        y: number;
        z: number;
        pitch: number;
        yaw: number;
        headYaw: number;
    };
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
}
