import type { LogLevel } from '@jsprismarine/logger';
import { isLogLevel } from '@jsprismarine/logger/levels';

import { JAVA_PACK_CACHE_DIRECTORY } from '../resourcePacks/javaPackCache';
import { isRecord } from '../utils/isRecord';
import { SeedGenerator } from '../utils/Seed';
import { withCwd } from '../utils/cwd';
import { readPlayerDataGroups } from '../world/playerDataGroups';
import type { PlayerDataGroup } from '../world/playerDataGroups';
import type { WorldData } from '../world/WorldManager';
import { ConfigBuilder } from './ConfigBuilder';
import { javaPortFromEnv } from './javaPortEnv';
import type { FileMigrations, MigrationLogger } from './FileMigrations';
import { migrateFile } from './FileMigrations';
import { CONFIG_KEY_ORDER } from './JsonConfigTypes';
import { BSTATS_ENDPOINT } from '../stats/bstats/service';
import type { BStatsConfig, ConfigDifficulty, ConfigFile, ContentConfigKey } from './JsonConfigTypes';
import { DEFAULT_WORLD_PRESET } from './normalizeWorldData';
import { DEFAULT_UPDATE_SETTINGS, readUpdateSettings, UPDATE_INTERVAL_MINUTES } from '../updates/settings';
import type { UpdateSettings } from '../updates/settings';
import { chunkWorkerCount } from '../world/generators/chunkConcurrency';
import { DEFAULT_FLUID_REPLACEMENT } from '../content/world/fluidReplacement';
import type { FluidReplacement } from '../content/world/fluidReplacement';

import { Difficulty, getGametypeName, PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { PrismarineServerErrors } from '@jsprismarine/errors/prismarine/server';

const isDev = process.env.NODE_ENV === 'development';

const FILE_NAME = 'config.json';

/** Returns the path to the server's JSON configuration file. */
export const configFilePath = (): string => withCwd(FILE_NAME);

/** The difficulty names a config file may use, as the protocol numbers them. */
export const DIFFICULTIES: Readonly<Record<string, Difficulty>> = {
    peaceful: Difficulty.PEACEFUL,
    easy: Difficulty.EASY,
    normal: Difficulty.NORMAL,
    hard: Difficulty.HARD
} satisfies Record<ConfigDifficulty, Difficulty>;

/**
 * The name a difficulty is spelled by, read back out of {@link DIFFICULTIES}
 * so the two directions cannot disagree.
 *
 * @param difficulty - The protocol number.
 * @returns The name, or `normal` for a number no name maps onto.
 */
export const difficultyName = (difficulty: Difficulty): string =>
    Object.entries(DIFFICULTIES).find(([, value]) => value === difficulty)?.[0] ?? 'normal';

/** What the server compresses at when the configured level is unusable. */
const DEFAULT_PACKET_COMPRESSION_LEVEL = 7;
/** Keep ZLib as the default until retail Bedrock clients are verified with other algorithms. */
const DEFAULT_PACKET_COMPRESSION_ALGORITHM = 'zlib';
/** Skip compression for small batch bodies, where the prefix alone costs fewer bytes than zlib. */
const DEFAULT_PACKET_COMPRESSION_THRESHOLD = 256;

/**
 * The port the script debugger listens on when `force-inbound-debug-port` is unset, which is the
 * default of Bedrock Dedicated Server and of the VS Code extension.
 */
const DEFAULT_SCRIPT_DEBUGGER_PORT = 19144;

/** The address the script debugger listens on unless `script-debugger-listen-address` names another. */
const DEFAULT_SCRIPT_DEBUGGER_LISTEN_ADDRESS = '127.0.0.1';

/** When the script debugger attaches by itself, as `script-debugger-auto-attach` names the modes. */
export const SCRIPT_DEBUGGER_AUTO_ATTACH_MODES = ['disabled', 'connect', 'listen'] as const;

/** One of {@link SCRIPT_DEBUGGER_AUTO_ATTACH_MODES}. */
export type ScriptDebuggerAutoAttach = (typeof SCRIPT_DEBUGGER_AUTO_ATTACH_MODES)[number];

/** The layout of `config.json` this server reads and writes. */
export const CONFIG_SCHEMA_VERSION = 1 as const;

/**
 * What each key means, written above it the first time the server adds it to the file.
 *
 * Kept beside the keys rather than in a separate document so a key cannot gain a meaning
 * the file does not explain. The getter JSDoc below says the same things at more length for
 * code that reads them.
 */
const COMMENTS = {
    schemaVersion:
        'The layout of this file. The server upgrades a file an older version wrote and keeps the original beside it.',
    'log-level': 'How much the console and the log file say: error, warn, info, verbose, debug or silly.',
    'server-port':
        "The port the server listens on, as Bedrock Dedicated Server's server-port: TCP for NetherNet signaling, and UDP for RakNet and NetherNet. Unless server-udp-ports is set, RakNet's IPv4 listener, NetherNet's players and Bedrock's query all use this one UDP port; RakNet's IPv6 listener uses server-portv6. Bedrock clients look for 19132.",
    'server-portv6':
        'The UDP port RakNet listens on for IPv6 clients when server-ip is 0.0.0.0. Bedrock clients look for 19133. It may equal server-port.',
    'server-ip': 'The address to listen on. 0.0.0.0 accepts connections on every interface.',
    'level-name': 'Which entry of `worlds` players join.',
    worlds: 'Every world the server loads, by name, with its preset, provider and seed. Write the seed as a string; a 64-bit seed written as a number is rounded.',
    'player-data-groups':
        'Groups of levels whose players share parts of their record, by group name: each lists its levels and the parts they share, from inventory, armor, offhand, enderChest, health, hunger, experience, gamemode, abilities, spawnPoint and position. Every other part, and every level in no group, keeps a record of its own.',
    'max-players': 'How many players may be online at once.',
    gamemode: 'The default game mode for new players: survival, creative, adventure or spectator.',
    difficulty: 'How dangerous the monsters are: peaceful, easy, normal or hard.',
    motd: 'The message shown in the server list.',
    'view-distance': 'How far players see, in chunks.',
    'preload-radius': 'How many chunks around spawn to generate before accepting players. 0 skips it.',
    'chunk-workers': 'How many worker threads to use for chunk generation. 0 keeps it on the server thread.',
    'chunk-host':
        'Where chunk generation workers run: process (the default) starts a separate low-priority generation process and falls back to threads when it cannot, in-process keeps them in the server process.',
    'terrain-cache-size-mb':
        'How many megabytes of generated terrain to keep on disk so it is not rebuilt after a restart. 0 turns the cache off.',
    'chunk-send-budget-ms': 'How long each tick may spend sending chunks, out of its 50 ms.',
    'proximity-broadcast': 'Whether positional packets only go to players near them. Turn off only to debug.',
    'server-authoritative-block-breaking':
        'Whether the server times block breaking, as a Bedrock Dedicated Server does. Off leaves it to the client.',
    'education-features':
        'Whether Bedrock clients join with Education Edition features on, as the Education toggle in world settings does.',
    'fluid-replacement':
        "Which edition decides what flowing water and lava wash away: java follows Java's #minecraft:washed_away_by_fluids tag, keeps flowing fluids out of waterloggable blocks and lets a water source waterlog one, bedrock follows each block's Bedrock liquid reaction.",
    'entity-tracking-hysteresis': "Chunks past view distance before an entity leaves a player's screen.",
    'entity-tracking-interval': 'Ticks between entity visibility passes, at least 1.',
    'keep-alive-interval':
        'Seconds between the pings that check a client is still there, for both editions. A client that leaves one unanswered until the next is disconnected. 0 sends none.',
    'allow-list': 'Whether only the players in allowlist.json may join, as on Bedrock Dedicated Server.',
    'online-mode':
        "Whether players must be signed in: Bedrock players to Xbox Live, Java Edition players to the account Mojang's session server vouches for.",
    'xbox-achievements':
        'Whether Bedrock players, operators included, can earn Xbox achievements. On, every client is told cheats are off and every command is sent as one that is not a cheat, so operators keep their commands and the server still decides who may run each one. The server also tells each client when its player kills a mob, is killed by an entity or runs a command, which some achievements count. A player earns none while in creative mode, or in a world with experiments on; other players are not affected.',
    'enable-raknet': 'Whether to accept clients over RakNet, the UDP transport Bedrock used before NetherNet.',
    'use-raknet-worker': 'Whether RakNet networking runs in a worker thread.',
    'enable-nethernet':
        'Whether to accept clients over NetherNet, the WebRTC transport Bedrock Dedicated Server defaults to.',
    'java-enabled': 'Whether Java Edition clients can join on java-port.',
    'java-port': 'The TCP port Java Edition clients connect to. They look for 25565.',
    'account-linking':
        'Whether a player can link their Java Edition and Xbox accounts with /link, so both play as one player with one record. Off, each account is its own player and links already made are kept but ignored.',
    'server-udp-ports':
        "The UDP ports NetherNet players use, as Bedrock Dedicated Server's server-udp-ports. A single port, such as 19489, puts every player on it. A range, such as 19400-19500, spreads players over its ports and reuses a port once every port has a player. Either can be a public:local mapping for a server behind NAT or port forwarding, such as 29489:19489 or 21200-21300:19400-19500, with the same number of ports on each side. Commas join entries whose local ports form one continuous range. Unset or empty, it is server-port, shared with RakNet. A port that is also server-port or server-portv6 is shared with RakNet. Ignored when enable-nethernet is off.",
    'server-public-ip':
        "The address NetherNet advertises to players, as Bedrock Dedicated Server's server-public-ip: set it when the server is behind NAT, a firewall or port forwarding. A raw IPv4 or a raw or [bracketed] IPv6, with no port or hostname. Empty advertises the host's own addresses and, to a player joining by address, the address that player typed. Ignored when enable-nethernet is off.",
    'enable-server-public-ip-lookup':
        'Whether NetherNet looks up the public address, by asking a few free web services, once a player reaches none of the addresses it offered, and offers it beside them when that player tries again. It never replaces server-public-ip. Off, it offers only what server-public-ip and the player give it. Ignored when enable-nethernet is off.',
    'enable-lan-visibility': 'Whether players on the local network see the server among their LAN games.',
    'texturepack-required':
        "Whether a player must take the installed addons' resource packs to join, as Bedrock Dedicated Server's texturepack-required. On, a player who declines them is disconnected. Off, a player may join without them.",
    'disable-client-vibrant-visuals':
        "Whether to tell joining Bedrock players to use the next best graphics setting instead of Vibrant Visuals, as Bedrock Dedicated Server's disable-client-vibrant-visuals.",
    'java-resource-pack-url': `The base URL Java Edition clients download the converted resource pack from, for a server behind a CDN or a proxy that does not pass HTTP. Each pack is <base>/<sha1>.zip, named by the SHA-1 of its zip rather than by its file in ${JAVA_PACK_CACHE_DIRECTORY}/, which is named by what it was converted from; the console names each file and the name to upload it under, beside the older ones. The server checks the URL when a player joins and when the packs change, at most once a minute, and offers a new pack once it serves it. Empty, the server serves the pack from its own Java port.`,
    'packet-compression-level': "The zlib level for outgoing batches, from -1 (zlib's default) to 9.",
    'packet-compression-algorithm':
        'The batch algorithm advertised to clients: zlib (default), snappy, or none. Other choices may use more bandwidth or differ in client support.',
    'packet-compression-threshold':
        'The smallest Bedrock batch body or Java packet to compress, in bytes. 0 leaves everything uncompressed.',
    'packet-full-flush-fragments':
        'Prototype: reuse independently compressed packet fragments. Requires retail client validation.',
    'enable-query': 'Whether to answer the GameSpy4 query protocol that server lists and status tools use.',
    'query-port':
        "The UDP port query answers on for Java Edition, as a Java server's query.port: 25565 when unset. Query always answers for Bedrock on server-port, beside the game, whatever this says. With java-enabled off, this port answers for Bedrock too. Set it to server-port to answer on that port alone.",
    'enable-process-title': 'Whether to show the tick rate in the process title. Some terminals redraw slowly.',
    'enable-ticking':
        'Whether the world ticks. Off is only for tests, which step the ticks by hand with Server.advanceTick. Until one does, nothing a tick runs happens: no chunks go out, so a joining client never spawns.',
    'log-excluded-packets': 'Packet class names kept out of the traffic log at the silly level.',
    'crafting-recipe-limit': 'How many recipes to send: -1 for all, 0 for none, or a cap.',
    stats: 'The services the server reports pseudonymous usage statistics to, one section each.',
    updates: `How the server checks for a newer JSPrismarine. A key left out follows the build: enabled (on unless the server runs from a checkout), channel (release, or nightly for a nightly build), source (owner/repo or an https URL) and interval (minutes between checks, ${UPDATE_INTERVAL_MINUTES.default} by default and at least ${UPDATE_INTERVAL_MINUTES.minimum}). See https://jsprismarine.dev/guide/updates.`,
    'script-watchdog-enable-shutdown':
        "Whether a hang, a stack overflow or running out of memory in a behavior pack script shuts the server down, as Bedrock Dedicated Server's setting of the same name does.",
    'script-watchdog-hang-threshold':
        'How long the behavior pack scripts of one tick may run before they are stopped, in milliseconds, as the Bedrock Dedicated Server setting of the same name. JSPrismarine counts work rather than time, so the same script stops at the same point on every machine.',
    'script-watchdog-memory-limit':
        'How many megabytes the behavior pack scripts of one world may allocate together. Going over saves and shuts the server down. 0 sets no limit.',
    'allow-inbound-script-debugging':
        "Whether /script debugger listen and script-debugger-auto-attach's listen mode may open a port for the VS Code script debugger to connect to, as Bedrock Dedicated Server's setting of the same name. Off by default.",
    'allow-outbound-script-debugging':
        "Whether /script debugger connect and script-debugger-auto-attach's connect mode may connect to a VS Code script debugger that listens, as Bedrock Dedicated Server's setting of the same name. Off by default.",
    'force-inbound-debug-port': `The one port the script debugger listens on. Once it is set, /script debugger listen takes no port. Unset, auto-attach's listen mode uses ${DEFAULT_SCRIPT_DEBUGGER_PORT}.`,
    'script-debugger-listen-address': `The address the script debugger listens on, ${DEFAULT_SCRIPT_DEBUGGER_LISTEN_ADDRESS} when unset. An address other than loopback lets other machines debug the scripts, so it needs script-debugger-passcode.`,
    'script-debugger-auto-attach':
        "Whether the script debugger attaches when the default level's scripts load, before they start: disabled, connect (to the debugger at script-debugger-auto-attach-connect-address) or listen (on force-inbound-debug-port). Each mode needs its allow-*-script-debugging setting.",
    'script-debugger-auto-attach-connect-address':
        "Where auto-attach's connect mode finds the debugger, as host:port, such as localhost:19144.",
    'script-debugger-auto-attach-timeout':
        'How many seconds the server waits for an auto-attached debugger before the scripts start. 0 does not wait.',
    'script-debugger-passcode':
        'The passcode the script debugger must send. VS Code asks the person attaching for it. Empty asks for none.'
} as const satisfies Record<Exclude<keyof ConfigFile, ContentConfigKey>, string>;

/** The script watchdog's settings, as `config.json`'s `script-watchdog-*` keys set them. */
export interface ScriptWatchdogConfig {
    /** `script-watchdog-enable-shutdown`. */
    readonly enableShutdown: boolean;
    /** `script-watchdog-hang-threshold`, in milliseconds. */
    readonly hangThreshold: number;
    /** `script-watchdog-memory-limit`, in megabytes; 0 for none. */
    readonly memoryLimit: number;
}

/** The script debugger's settings, as `config.json`'s keys under Bedrock Dedicated Server's names set them. */
export interface ScriptDebuggerConfig {
    /** `allow-inbound-script-debugging`: whether the server may listen for the debugger. */
    readonly allowInbound: boolean;
    /** `allow-outbound-script-debugging`: whether the server may connect to a debugger that listens. */
    readonly allowOutbound: boolean;
    /** The port a listener uses when the command names none: `force-inbound-debug-port`, or the default. */
    readonly listenPort: number;
    /** Whether `force-inbound-debug-port` is set, which takes the port out of `/script debugger listen`. */
    readonly portForced: boolean;
    /** `script-debugger-listen-address`. */
    readonly listenAddress: string;
    /** `script-debugger-auto-attach`. */
    readonly autoAttach: ScriptDebuggerAutoAttach;
    /** `script-debugger-auto-attach-connect-address`, as `host:port`; empty when unset. */
    readonly autoAttachConnectAddress: string;
    /** `script-debugger-auto-attach-timeout`, in seconds. */
    readonly autoAttachTimeout: number;
    /** `script-debugger-passcode`; empty for none. */
    readonly passcode: string;
}

/**
 * Written above `stats.bstats` when the server adds the section. The wording is the one Bastian
 * Oppermann, who runs bStats, suggested for bStats' own clients. It says pseudonymous rather than
 * anonymous, because the server UUID ties the reports from one server together.
 */
const BSTATS_COMMENT = [
    'This server sends pseudonymous usage statistics, such as the player count and operating system,',
    'to bStats (https://bStats.org). This has no noticeable impact on performance. To turn it off,',
    'set enabled to false. To see exactly what is sent, set log-sent-data to true.',
    'Learn more here: https://bstats.org/docs/server-owners'
].join('\n');

/**
 * Settings a fresh config leaves out. Each is read when the file has it, and reading one writes
 * nothing, so an unset one keeps following the setting it defaults to, such as `server-port`.
 */
export const OPTIONAL_SETTINGS = [
    'player-data-groups',
    'server-udp-ports',
    'server-public-ip',
    'query-port',
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
    'script-debugger-passcode'
] as const satisfies readonly (keyof typeof COMMENTS)[];

/** A setting a fresh config leaves out; see {@link OPTIONAL_SETTINGS}. */
export type OptionalSetting = (typeof OPTIONAL_SETTINGS)[number];

/**
 * The settings a fresh config leaves out, each with the comment it gets once written.
 * @returns The settings, in the order the file would list them.
 */
export const optionalSettings = (): readonly { key: OptionalSetting; comment: string }[] =>
    OPTIONAL_SETTINGS.map((key) => ({ key, comment: COMMENTS[key] }));

/**
 * What each key is worth when the file does not say.
 *
 * The fields below start here and {@link Config.enable} reads the same values,
 * so the two cannot drift and a `Config` whose `enable` never ran answers the
 * way a config file with nothing in it does. That is not hypothetical: the
 * test servers subclass `Config` and stub `enable`, which left `difficulty`
 * undefined; `getDifficulty` then threw partway through the join burst and
 * left the client waiting at `AWAITING_SPAWN` for packets that never came. A
 * default rather than a louder throw because every one of these keys is
 * already optional in the file - a server starts with no config file at all,
 * and a config nobody enabled is the same question asked a second way.
 *
 * `worlds` is the one key with no entry: its default carries a fresh seed, so
 * it is generated per config rather than written down. See
 * {@link defaultWorlds}.
 */
const DEFAULTS = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    'log-level': isDev ? 'verbose' : 'info',
    'server-port': 19132,
    // Bedrock clients look for a server's IPv6 listener on 19133.
    'server-portv6': 19133,
    'server-ip': '0.0.0.0',
    'level-name': 'world',
    'max-players': 20,
    gamemode: 'survival',
    difficulty: 'normal',
    motd: 'Another JSPrismarine server!',
    'view-distance': 10,
    'preload-radius': 10,
    'chunk-workers': Math.max(0, chunkWorkerCount()),
    'chunk-host': 'process',
    'terrain-cache-size-mb': 1024,
    'chunk-send-budget-ms': 5,
    'proximity-broadcast': true,
    'server-authoritative-block-breaking': true,
    'education-features': false,
    'fluid-replacement': DEFAULT_FLUID_REPLACEMENT,
    'entity-tracking-hysteresis': 2,
    'entity-tracking-interval': 4,
    'keep-alive-interval': 15,
    'allow-list': false,
    'online-mode': true,
    'xbox-achievements': true,
    'enable-raknet': true,
    'use-raknet-worker': true,
    'enable-nethernet': true,
    'java-enabled': true,
    'java-port': 25565,
    'account-linking': true,
    'server-udp-ports': '',
    'server-public-ip': '',
    'enable-server-public-ip-lookup': true,
    'enable-lan-visibility': true,
    'texturepack-required': false,
    'disable-client-vibrant-visuals': false,
    'java-resource-pack-url': '',
    'packet-compression-level': DEFAULT_PACKET_COMPRESSION_LEVEL,
    'packet-compression-algorithm': DEFAULT_PACKET_COMPRESSION_ALGORITHM,
    'packet-compression-threshold': DEFAULT_PACKET_COMPRESSION_THRESHOLD,
    'packet-full-flush-fragments': false,
    'enable-query': true,
    // A fresh config does not write query-port; unset, it is the port Java status tools query.
    'query-port': 25565,
    'enable-process-title': true,
    'enable-ticking': true,
    'log-excluded-packets': [],
    'crafting-recipe-limit': -1,
    stats: {
        bstats: {
            enabled: true,
            'log-errors': false,
            'log-sent-data': false,
            'log-response-status-text': false,
            endpoint: BSTATS_ENDPOINT
        }
    },
    // Every key left out, so each follows the build.
    updates: {},
    // Bedrock Dedicated Server's defaults for the same keys.
    'script-watchdog-enable-shutdown': true,
    'script-watchdog-hang-threshold': 10_000,
    'script-watchdog-memory-limit': 250,
    'allow-inbound-script-debugging': false,
    'allow-outbound-script-debugging': false,
    // Unset, the port is not forced; this is the port auto-attach then listens on.
    'force-inbound-debug-port': DEFAULT_SCRIPT_DEBUGGER_PORT,
    'script-debugger-listen-address': DEFAULT_SCRIPT_DEBUGGER_LISTEN_ADDRESS,
    'script-debugger-auto-attach': 'disabled',
    'script-debugger-auto-attach-connect-address': '',
    'script-debugger-auto-attach-timeout': 0,
    'script-debugger-passcode': '',
    'player-data-groups': {}
} as const satisfies Omit<Record<keyof typeof COMMENTS, unknown>, 'worlds'> & {
    stats: { bstats: Required<BStatsConfig> };
};

/**
 * How `config.json` upgrades. A file without `schemaVersion` is version 0, every file before the
 * key existed.
 */
export const CONFIG_MIGRATIONS: FileMigrations = {
    fileName: FILE_NAME,
    unversioned: 0,
    current: CONFIG_SCHEMA_VERSION,
    versionComment: COMMENTS.schemaVersion,
    keyOrder: CONFIG_KEY_ORDER,
    steps: [
        {
            // `port` was server-port's name before it took Bedrock Dedicated Server's.
            to: 1,
            migrate: (document) => {
                if (!document.has(['port'])) return undefined;
                if (document.has(['server-port'])) {
                    throw new PrismarineServerErrors.PortAndServerPortBothSet({ configFilePath: configFilePath() });
                }
                document.rename('port', 'server-port');
                return undefined;
            }
        }
    ]
};

/**
 * Opens `config.json` for reading and writing one key at a time, creating it at the current
 * version when there is none, so a fresh file is not taken for one written before versions.
 */
export const openConfigFile = (): ConfigBuilder =>
    new ConfigBuilder(configFilePath(), CONFIG_KEY_ORDER, (document) =>
        document.set(['schemaVersion'], CONFIG_SCHEMA_VERSION, COMMENTS.schemaVersion)
    );

/**
 * The `stats.bstats` settings as the server reads them: the keys of {@link BStatsConfig}.
 * `enabled` is true only when the file holds a literal `true` there or has no section.
 */
export interface BStatsSettings extends Readonly<Required<BStatsConfig>> {
    /**
     * Why `enabled` reads as false although the file does not set it to `false`: the text names
     * the key and the value that is not a boolean, or not a section. Unset when the file is fine.
     */
    readonly problem?: string;
}

/** Whether a value is an absolute `http:` or `https:` URL, the only kind `stats.bstats.endpoint` takes. */
const isHttpUrl = (value: unknown): value is string => {
    if (typeof value !== 'string' || !URL.canParse(value)) return false;
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
};

/**
 * The single world a server with no `worlds` key runs: the normal preset on a seed of its own.
 *
 * The seed is written as a string because it is a 64-bit value and a JSON number is a double:
 * written as a number, half the seeds this draws would be read back rounded. See
 * {@link import('./JsonConfigTypes').WorldData.seed}.
 */
const defaultWorlds = (): Record<string, WorldData> => ({
    world: { preset: DEFAULT_WORLD_PRESET, provider: 'LevelDB', seed: SeedGenerator().toString() }
});

/** Runtime settings that take precedence over values in the server config file. */
export interface ConfigOptions {
    /** Port the server listens on. */
    serverPort?: number;
}

/**
 * Clamps a configured zlib level to the range zlib accepts.
 *
 * zlib takes -1 (its own default) through 9 and errors on anything else. The value comes
 * straight out of a hand edited config file, and an unchecked `10` reached deflate as a
 * rejection on the chunk sending path, which is nowhere near where the typo was, and
 * used to take the server's tick down with it. Clamping keeps a bad number a bad number
 * rather than an outage.
 *
 * @param raw - The value read from the config file, of whatever type the file held.
 * @returns An integer from -1 to 9, or the default of 7 when `raw` is not an integer.
 */
export function toPacketCompressionLevel(raw: unknown): number {
    const level = Number(raw);
    if (!Number.isInteger(level)) return DEFAULT_PACKET_COMPRESSION_LEVEL;

    return Math.min(9, Math.max(-1, level));
}

/**
 * Bounds the configured threshold to a protocol-safe unsigned 16-bit value.
 *
 * Zero disables compression, matching Bedrock's `NetworkSettings` semantics; positive values
 * compress batch bodies at or above that size.
 * @param raw - The value read from the config file, of whatever type the file held.
 * @returns An integer from 0 to 65,535, or the default of 256 when `raw` is not an integer.
 */
export function toPacketCompressionThreshold(raw: unknown): number {
    const threshold = Number(raw);
    if (!Number.isInteger(threshold)) return DEFAULT_PACKET_COMPRESSION_THRESHOLD;

    return Math.min(65_535, Math.max(0, threshold));
}

export class Config {
    private configBuilder!: ConfigBuilder;
    /** The last file write a setter queued; see {@link Config.writeLater}. */
    private writes: Promise<void> = Promise.resolve();

    private readonly serverPortOverride: number | undefined;

    private logLevel: LogLevel = DEFAULTS['log-level'];

    private port: number = DEFAULTS['server-port'];
    private portV6: number = DEFAULTS['server-portv6'];
    private serverIp: string = DEFAULTS['server-ip'];
    private levelName: string = DEFAULTS['level-name'];
    private worlds: Record<string, WorldData> = defaultWorlds();
    /** The groups of levels whose players share parts of their record; see `player-data-groups`. */
    private playerDataGroups: readonly PlayerDataGroup[] = [];
    /** What `player-data-groups` held that the server left out, for the log. */
    private playerDataGroupProblems: readonly string[] = [];
    private maxPlayers: number = DEFAULTS['max-players'];
    private gamemode: string = DEFAULTS.gamemode;
    private difficulty: string = DEFAULTS.difficulty;
    private motd: string = DEFAULTS.motd;
    private viewDistance: number = DEFAULTS['view-distance'];
    private preloadRadius: number = DEFAULTS['preload-radius'];
    private chunkWorkers: number = DEFAULTS['chunk-workers'];
    private chunkHost: string = DEFAULTS['chunk-host'];
    private terrainCacheSizeMb: number = DEFAULTS['terrain-cache-size-mb'];
    private chunkSendBudgetMs: number = DEFAULTS['chunk-send-budget-ms'];
    private proximityBroadcast: boolean = DEFAULTS['proximity-broadcast'];
    private serverAuthoritativeBlockBreaking: boolean = DEFAULTS['server-authoritative-block-breaking'];
    private educationFeatures: boolean = DEFAULTS['education-features'];
    private fluidReplacement: string = DEFAULTS['fluid-replacement'];
    private entityTrackingHysteresis: number = DEFAULTS['entity-tracking-hysteresis'];
    private entityTrackingInterval: number = DEFAULTS['entity-tracking-interval'];
    private keepAliveInterval: number = DEFAULTS['keep-alive-interval'];
    private allowList: boolean = DEFAULTS['allow-list'];
    private onlineMode: boolean = DEFAULTS['online-mode'];
    private xboxAchievements: boolean = DEFAULTS['xbox-achievements'];
    private enableRakNet: boolean = DEFAULTS['enable-raknet'];
    private useRakNetWorker: boolean = DEFAULTS['use-raknet-worker'];
    private enableNetherNet: boolean = DEFAULTS['enable-nethernet'];
    private javaEnabled: boolean = DEFAULTS['java-enabled'];
    private javaPort: number = DEFAULTS['java-port'];
    private accountLinking: boolean = DEFAULTS['account-linking'];
    private serverUdpPorts: string = DEFAULTS['server-udp-ports'];
    private serverPublicIp: string = DEFAULTS['server-public-ip'];
    private enableServerPublicIpLookup: boolean = DEFAULTS['enable-server-public-ip-lookup'];
    private enableLanVisibility: boolean = DEFAULTS['enable-lan-visibility'];
    private texturepackRequired: boolean = DEFAULTS['texturepack-required'];
    private disableClientVibrantVisuals: boolean = DEFAULTS['disable-client-vibrant-visuals'];
    private javaResourcePackUrl: string = DEFAULTS['java-resource-pack-url'];
    private packetCompressionLevel: number = DEFAULTS['packet-compression-level'];
    private packetCompressionAlgorithm: ConfigFile['packet-compression-algorithm'] =
        DEFAULTS['packet-compression-algorithm'];
    private packetCompressionThreshold: number = DEFAULTS['packet-compression-threshold'];
    private packetFullFlushFragments: boolean = DEFAULTS['packet-full-flush-fragments'];

    /**
     * Controls if the minecraft/source query response should be enabled.
     */
    private enableQuery: boolean = DEFAULTS['enable-query'];

    /** The `script-watchdog-*` settings, under Bedrock Dedicated Server's names and meanings. */
    private scriptWatchdog: ScriptWatchdogConfig = {
        enableShutdown: DEFAULTS['script-watchdog-enable-shutdown'],
        hangThreshold: DEFAULTS['script-watchdog-hang-threshold'],
        memoryLimit: DEFAULTS['script-watchdog-memory-limit']
    };

    /** The `script-debugger-*` and `*-script-debugging` settings, under Bedrock Dedicated Server's names and meanings. */
    private scriptDebugger: ScriptDebuggerConfig = {
        allowInbound: DEFAULTS['allow-inbound-script-debugging'],
        allowOutbound: DEFAULTS['allow-outbound-script-debugging'],
        listenPort: DEFAULTS['force-inbound-debug-port'],
        portForced: false,
        listenAddress: DEFAULTS['script-debugger-listen-address'],
        autoAttach: DEFAULTS['script-debugger-auto-attach'],
        autoAttachConnectAddress: DEFAULTS['script-debugger-auto-attach-connect-address'],
        autoAttachTimeout: DEFAULTS['script-debugger-auto-attach-timeout'],
        passcode: DEFAULTS['script-debugger-passcode']
    };

    /** The UDP port the query protocol answers on; equal to {@link port} to share RakNet's socket. */
    /** `query-port` as the file sets it, or undefined when it is left at its default. */
    private queryPortSetting: number | undefined;

    /**
     * Controls if the process title should be updated.
     * @remarks this can cause performance issues in some terminals.
     */
    private enableProcessTitle: boolean = DEFAULTS['enable-process-title'];

    /**
     * Controls if the ticking should be enabled.
     */
    private enableTicking: boolean = DEFAULTS['enable-ticking'];

    /**
     * Packets left out of the traffic log, by class name.
     *
     * At `silly` level every packet in and out is written down, and the ones on a timer -
     * `SetTimePacket` goes to every player twenty times a second - bury everything else.
     * Excluding them by name is the only way to keep the rest.
     */
    private logExcludedPackets: string[] = [...DEFAULTS['log-excluded-packets']];

    /**
     * How many recipes to send: `-1` for every one, `0` for none, a positive number to cap.
     *
     * Everything by default, and the other two are for when something is wrong.
     * `CraftingDataPacket` packs its fields densely, and a client that rejects it reports an
     * offset into the whole thing - which tells you nothing when the whole thing is a hundred
     * and forty kilobytes. Dropping to one puts any complaint in the first two hundred bytes,
     * where it can be read by hand; dropping to zero answers the question before that one,
     * which is whether this packet is involved at all.
     *
     * Both were worth having: a truncated item stack in the first recipe once took the client
     * out without a word, and the way back was zero, then one, then ten.
     */
    private craftingRecipeLimit: number = DEFAULTS['crafting-recipe-limit'];

    private bstatsSettings: BStatsSettings = DEFAULTS.stats.bstats;

    /** Whether this start wrote the `stats.bstats` section into the file. */
    private bstatsSectionCreated = false;

    private updateSettings: UpdateSettings = DEFAULT_UPDATE_SETTINGS;

    /**
     * Creates the server configuration.
     *
     * @param options - runtime values that override settings in the server config file.
     */
    public constructor({ serverPort }: ConfigOptions = {}) {
        this.serverPortOverride = serverPort;
        this.configBuilder = openConfigFile();
        // Read without writing the default: `enable` migrates the file first, and its backup should
        // hold the file as the owner left it.
        const logLevel = this.configBuilder.get('log-level');
        this.logLevel = isLogLevel(logLevel) ? logLevel : DEFAULTS['log-level'];
    }

    /**
     * On enable hook.
     *
     * Reads every setting, writing the default and its comment into the file for any key the
     * file does not have yet. A file from an older version therefore gains the new keys,
     * explained, without losing anything a person wrote in it. Before that, a file at an older
     * {@link CONFIG_SCHEMA_VERSION} runs the {@link CONFIG_MIGRATIONS} steps up to the current one.
     * @param logger - Told which versions a migrated file went from and to. Defaults to the console.
     * @throws PortAndServerPortBothSet, and the other errors a migration throws, when the file
     *   cannot be upgraded; it is left as it was.
     * @group Lifecycle
     */
    public async enable(logger: MigrationLogger = console): Promise<void> {
        await migrateFile(configFilePath(), CONFIG_MIGRATIONS, logger);
        const config = openConfigFile();
        this.configBuilder = config;
        const read = <T>(key: keyof typeof COMMENTS, defaults: T): T => config.get(key, defaults, COMMENTS[key]);
        // For a key a fresh config leaves out: absent means its default, and reading it writes nothing.
        const readUnwritten = <T>(
            key: OptionalSetting,
            defaults: T,
            kind: 'number' | 'string' | 'boolean' = typeof defaults === 'string'
                ? 'string'
                : typeof defaults === 'boolean'
                  ? 'boolean'
                  : 'number'
        ): T => {
            const stored = config.get(key);
            // The stored value is the file's; a value of another kind is ignored, as `read` does.
            return typeof stored === kind ? (stored as T) : defaults;
        };

        this.logLevel = read('log-level', DEFAULTS['log-level']);
        const filePort = read('server-port', DEFAULTS['server-port']);
        this.port = this.serverPortOverride ?? filePort;
        this.portV6 = read('server-portv6', DEFAULTS['server-portv6']);
        this.serverIp = read('server-ip', DEFAULTS['server-ip']);
        this.levelName = read('level-name', DEFAULTS['level-name']);
        this.worlds = read<Record<string, WorldData>>('worlds', this.worlds);
        const groups = readPlayerDataGroups(config.get('player-data-groups'));
        this.playerDataGroups = groups.groups;
        this.playerDataGroupProblems = groups.problems;
        this.maxPlayers = read('max-players', DEFAULTS['max-players']);
        this.gamemode = read('gamemode', DEFAULTS.gamemode);
        this.difficulty = read('difficulty', DEFAULTS.difficulty);
        this.motd = read('motd', DEFAULTS.motd);
        this.viewDistance = read('view-distance', DEFAULTS['view-distance']);
        this.preloadRadius = read('preload-radius', DEFAULTS['preload-radius']);
        this.chunkWorkers = read('chunk-workers', DEFAULTS['chunk-workers']);
        this.chunkHost = read('chunk-host', DEFAULTS['chunk-host']);
        this.terrainCacheSizeMb = read('terrain-cache-size-mb', DEFAULTS['terrain-cache-size-mb']);
        this.chunkSendBudgetMs = read('chunk-send-budget-ms', DEFAULTS['chunk-send-budget-ms']);
        this.proximityBroadcast = read('proximity-broadcast', DEFAULTS['proximity-broadcast']);
        this.serverAuthoritativeBlockBreaking = read(
            'server-authoritative-block-breaking',
            DEFAULTS['server-authoritative-block-breaking']
        );
        this.educationFeatures = read('education-features', DEFAULTS['education-features']);
        this.fluidReplacement = read('fluid-replacement', DEFAULTS['fluid-replacement']);
        this.entityTrackingHysteresis = read('entity-tracking-hysteresis', DEFAULTS['entity-tracking-hysteresis']);
        this.entityTrackingInterval = read('entity-tracking-interval', DEFAULTS['entity-tracking-interval']);
        this.keepAliveInterval = read('keep-alive-interval', DEFAULTS['keep-alive-interval']);
        this.allowList = read('allow-list', DEFAULTS['allow-list']);
        this.onlineMode = read('online-mode', DEFAULTS['online-mode']);
        this.xboxAchievements = read('xbox-achievements', DEFAULTS['xbox-achievements']);
        this.enableRakNet = read('enable-raknet', DEFAULTS['enable-raknet']);
        this.useRakNetWorker = read('use-raknet-worker', DEFAULTS['use-raknet-worker']);
        this.enableNetherNet = read('enable-nethernet', DEFAULTS['enable-nethernet']);
        this.javaEnabled = read('java-enabled', DEFAULTS['java-enabled']);
        // Read first, so a fresh file still gains the key and its comment.
        const fileJavaPort = read('java-port', DEFAULTS['java-port']);
        this.javaPort = javaPortFromEnv() ?? fileJavaPort;
        this.accountLinking = read('account-linking', DEFAULTS['account-linking']);
        // Unset, NetherNet's UDP and query follow the server port, as Bedrock Dedicated Server's
        // server-udp-ports does; reading them writes nothing.
        this.serverUdpPorts = readUnwritten('server-udp-ports', DEFAULTS['server-udp-ports']);
        this.serverPublicIp = readUnwritten('server-public-ip', DEFAULTS['server-public-ip']);
        this.enableServerPublicIpLookup = read(
            'enable-server-public-ip-lookup',
            DEFAULTS['enable-server-public-ip-lookup']
        );
        this.enableLanVisibility = read('enable-lan-visibility', DEFAULTS['enable-lan-visibility']);
        this.texturepackRequired = read('texturepack-required', DEFAULTS['texturepack-required']);
        this.disableClientVibrantVisuals = read(
            'disable-client-vibrant-visuals',
            DEFAULTS['disable-client-vibrant-visuals']
        );
        this.javaResourcePackUrl = read('java-resource-pack-url', DEFAULTS['java-resource-pack-url']);
        this.packetCompressionLevel = read('packet-compression-level', DEFAULTS['packet-compression-level']);
        this.packetCompressionAlgorithm = read(
            'packet-compression-algorithm',
            DEFAULTS['packet-compression-algorithm']
        );
        this.packetCompressionThreshold = read(
            'packet-compression-threshold',
            DEFAULTS['packet-compression-threshold']
        );
        this.packetFullFlushFragments = read('packet-full-flush-fragments', DEFAULTS['packet-full-flush-fragments']);
        this.enableQuery = read('enable-query', this.enableQuery);
        this.queryPortSetting = readUnwritten<number | undefined>('query-port', undefined);
        this.enableProcessTitle = read('enable-process-title', this.enableProcessTitle);
        this.enableTicking = read('enable-ticking', this.enableTicking);
        this.logExcludedPackets = read('log-excluded-packets', this.logExcludedPackets);
        this.craftingRecipeLimit = read('crafting-recipe-limit', this.craftingRecipeLimit);
        // A server without script packs never needs them, so a fresh file leaves them out.
        this.scriptWatchdog = {
            enableShutdown: readUnwritten(
                'script-watchdog-enable-shutdown',
                DEFAULTS['script-watchdog-enable-shutdown']
            ),
            hangThreshold: readUnwritten('script-watchdog-hang-threshold', DEFAULTS['script-watchdog-hang-threshold']),
            memoryLimit: readUnwritten('script-watchdog-memory-limit', DEFAULTS['script-watchdog-memory-limit'])
        };
        const forcedPort = readUnwritten<number | undefined>('force-inbound-debug-port', undefined, 'number');
        const autoAttach = readUnwritten<string>(
            'script-debugger-auto-attach',
            DEFAULTS['script-debugger-auto-attach']
        );
        this.scriptDebugger = {
            allowInbound: readUnwritten('allow-inbound-script-debugging', DEFAULTS['allow-inbound-script-debugging']),
            allowOutbound: readUnwritten(
                'allow-outbound-script-debugging',
                DEFAULTS['allow-outbound-script-debugging']
            ),
            listenPort: forcedPort ?? DEFAULTS['force-inbound-debug-port'],
            portForced: forcedPort !== undefined,
            listenAddress: readUnwritten<string>(
                'script-debugger-listen-address',
                DEFAULTS['script-debugger-listen-address']
            ),
            autoAttach: SCRIPT_DEBUGGER_AUTO_ATTACH_MODES.find((mode) => mode === autoAttach) ?? 'disabled',
            autoAttachConnectAddress: readUnwritten<string>(
                'script-debugger-auto-attach-connect-address',
                DEFAULTS['script-debugger-auto-attach-connect-address']
            ),
            autoAttachTimeout: readUnwritten<number>(
                'script-debugger-auto-attach-timeout',
                DEFAULTS['script-debugger-auto-attach-timeout']
            ),
            passcode: readUnwritten<string>('script-debugger-passcode', DEFAULTS['script-debugger-passcode'])
        };
        this.readStats(config);
        // Written empty, with the comment that names its keys, so each key follows the build
        // until the owner sets it; a value written now would pin a channel the build later changes.
        // `set` rather than `read`, which throws on a read-only file: a section that cannot be
        // written is read as missing, and every key follows the build.
        if (!config.has('updates')) config.set('updates', DEFAULTS.updates, COMMENTS.updates);
        this.updateSettings = readUpdateSettings(config.get('updates'));
    }

    /**
     * Reads the `stats` section. A file with no `stats.bstats` section gets one, with its comment
     * and bStats on. Anything else turns bStats on only for a literal `enabled: true`: a `stats` or
     * `stats.bstats` that is not a section, or an `enabled` that is missing or not a boolean,
     * or a top-level key spelled `stats.bstats`, reads as off, with {@link BStatsSettings.problem}
     * saying why, and the file is left as it is.
     * A logging switch the section lacks is written with its default, and one that is not a
     * boolean reads as its default. A missing `endpoint` is written with bStats' own, and one that
     * is not an http or https URL turns bStats off, so reports never go somewhere unintended. A file that refuses to store the section turns bStats off too:
     * the server would otherwise report without the section, and its notice, ever being written.
     */
    private readStats(config: ConfigBuilder): void {
        const defaults = DEFAULTS.stats.bstats;
        this.bstatsSectionCreated = false;
        this.bstatsSettings = defaults;
        const offFor = (key: string, value: unknown, expected: string): BStatsSettings => ({
            ...defaults,
            enabled: false,
            problem: `${key} in config.json is ${value === undefined ? 'missing' : JSON.stringify(value)}, not ${expected}, so bStats is off. Set stats.bstats.enabled to true or false.`
        });

        const unwritten = (key: string): BStatsSettings => ({
            ...defaults,
            enabled: false,
            problem: `config.json could not be written to add ${key}, so bStats is off.`
        });

        if (!config.has('stats')) config.set('stats', {}, COMMENTS.stats);
        const stats = config.get('stats');
        if (stats === undefined) {
            this.bstatsSettings = unwritten('stats');
            return;
        }
        if (!isRecord(stats)) {
            this.bstatsSettings = offFor('stats', stats, 'a section');
            return;
        }
        if (!('bstats' in stats)) {
            // With no nested section, only a top-level key spelled "stats.bstats" answers to this
            // path, and writing the section would replace it.
            if (config.has('stats.bstats')) {
                this.bstatsSettings = {
                    ...defaults,
                    enabled: false,
                    problem:
                        '"stats.bstats" in config.json is a top-level key, not a section inside stats, so bStats is off. Move it into the stats section.'
                };
                return;
            }
            this.bstatsSectionCreated = config.set('stats.bstats', defaults, BSTATS_COMMENT);
            if (!this.bstatsSectionCreated) this.bstatsSettings = unwritten('stats.bstats');
            return;
        }
        const section = stats.bstats;
        if (!isRecord(section)) {
            this.bstatsSettings = offFor('stats.bstats', section, 'a section');
            return;
        }

        const flag = (key: Exclude<keyof BStatsConfig, 'enabled' | 'endpoint'>): boolean => {
            const stored = section[key];
            if (typeof stored === 'boolean') return stored;
            if (stored === undefined) config.set(`stats.bstats.${key}`, defaults[key]);
            return defaults[key];
        };
        const flags = {
            'log-errors': flag('log-errors'),
            'log-sent-data': flag('log-sent-data'),
            'log-response-status-text': flag('log-response-status-text')
        } satisfies Omit<BStatsSettings, 'enabled' | 'endpoint' | 'problem'>;
        const endpoint = section.endpoint;
        if (endpoint === undefined) config.set('stats.bstats.endpoint', defaults.endpoint);
        const enabled = section.enabled;
        if (typeof enabled !== 'boolean') {
            this.bstatsSettings = { ...offFor('stats.bstats.enabled', enabled, 'true or false'), ...flags };
            return;
        }
        if (endpoint !== undefined && !isHttpUrl(endpoint)) {
            this.bstatsSettings = {
                ...defaults,
                ...flags,
                enabled: false,
                problem: `stats.bstats.endpoint in config.json is ${JSON.stringify(endpoint)}, not an http or https URL, so bStats is off. Set it to a URL, or remove it to use ${defaults.endpoint}.`
            };
            return;
        }
        this.bstatsSettings = { ...flags, enabled, endpoint: endpoint ?? defaults.endpoint };
    }

    /**
     * On disable hook. Waits for the file writes setters queued, so a change made just before
     * the server stops still reaches the file.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        await this.writes;
    }

    /**
     * Writes one key to the config file on a later turn of the event loop, behind the writes
     * queued before it. A setter called from an input-lane handler changes memory at once and
     * leaves the file to after the input step
     * ([ADR 0014](../../../../docs/adr/0014-handlers-share-a-shape-and-run-in-the-input-step.md)).
     * The file is read and rewritten in one synchronous step when the write runs, so a key
     * another setter writes in between is not lost.
     *
     * @returns Settles once the key is in the file.
     * @throws Error, through the promise, when the file could not be read or written. The writes
     *   queued after it still run.
     */
    private writeLater(key: keyof ConfigFile, value: unknown): Promise<void> {
        const written = this.writes.then(
            () =>
                new Promise<void>((resolve, reject) => {
                    setImmediate(() => {
                        try {
                            if (this.configBuilder.set(key, value)) resolve();
                            else
                                reject(
                                    new PrismarineServerErrors.ConfigNotWritable({
                                        key,
                                        path: this.configBuilder.getPath()
                                    })
                                );
                        } catch (error: unknown) {
                            reject(error);
                        }
                    });
                })
        );
        this.writes = written.catch(() => undefined);
        return written;
    }

    public getLogLevel(): LogLevel {
        return this.logLevel;
    }

    /**
     * Get the server's port.
     * @returns {number} The server's port
     * @remarks The default port is `19132`.
     */
    public getServerPort(): number {
        return this.port;
    }

    /**
     * The UDP port RakNet listens on for IPv6 clients, as Bedrock Dedicated Server's
     * `server-portv6`. Only a server bound to the IPv4 wildcard, `0.0.0.0`, also listens on
     * IPv6: an operator who named one IPv4 interface asked for that interface alone.
     * @remarks The default port is `19133`, where Bedrock clients look for it.
     * @returns The IPv6 port.
     */
    public getServerPortV6(): number {
        return this.portV6;
    }

    /**
     * Get the server's IP address.
     * @remarks The default IP address is `0.0.0.0`
     * @returns {string} The server's IP address
     */
    public getServerIp(): string {
        return this.serverIp;
    }

    /**
     * Returns the default world's name (`id`).
     * @returns The world's name as a `string`
     * @remarks
     * If the world doesn't exist as a part of the `worlds` array the `worldManager` will
     * fail to initialize.
     */
    public getLevelName(): string {
        return this.levelName;
    }

    public getWorlds(): Record<string, WorldData> {
        return this.worlds;
    }

    /** The groups of levels whose players share parts of their record, from `player-data-groups`. */
    public getPlayerDataGroups(): readonly PlayerDataGroup[] {
        return this.playerDataGroups;
    }

    /** What `player-data-groups` held that the server left out, each a sentence without its full stop. */
    public getPlayerDataGroupProblems(): readonly string[] {
        return this.playerDataGroupProblems;
    }

    /**
     * Replaces one `worlds` entry, which is how an entry read in the old `generator` and
     * `layers` spelling is written back as `preset` and `dimensions` so the file converges.
     *
     * The whole `worlds` map is rewritten, because the file keeps its top-level keys and their
     * comments but a replaced map loses the comments inside it. Nothing else in the file moves.
     *
     * @param name - The world's key under `worlds`.
     * @param data - The entry to store, normally from `worldDataOf`.
     * @param commit - Whether to write the map to the config file.
     */
    public setWorld(name: string, data: WorldData, commit = false): void {
        this.worlds = { ...this.worlds, [name]: data };
        if (commit) this.configBuilder.set('worlds', this.worlds);
    }

    /**
     *
     * @returns The max amount of players allowed onto the server at the same time.
     */
    public getMaxPlayers() {
        return this.maxPlayers;
    }

    public getGamemode() {
        return this.gamemode;
    }

    /**
     * How dangerous the monsters are.
     *
     * Named in the file rather than numbered, as the gamemode is, because `difficulty: 2` in a
     * config nobody can read is how a server ends up on the wrong one. An unrecognized name falls
     * back to normal instead of refusing to start - a typo should not take a server down.
     * @returns {Difficulty} The configured difficulty.
     */
    public getDifficulty(): Difficulty {
        return DIFFICULTIES[this.difficulty.toLowerCase()] ?? Difficulty.NORMAL;
    }

    /**
     * Set the default gamemode.
     *
     * The value changes at once. The file is written afterwards, off the tick, so an input-lane
     * handler can call this.
     *
     * @param gamemode - the gamemode
     * @param commit - whether to write the value to the server config file
     * @returns Settles once the value is in the file, and at once when `commit` is false.
     * @throws Error, through the promise, when the file could not be written.
     */
    public setGamemode(gamemode: number, commit = false): Promise<void> {
        this.gamemode = getGametypeName(gamemode);
        return commit ? this.writeLater('gamemode', this.gamemode) : Promise.resolve();
    }

    /**
     * Set how dangerous the monsters are.
     *
     * Stored by name, as the file spells it, so `getDifficulty` reads back
     * what was set rather than a second copy of the number.
     * @param difficulty - the difficulty
     * @param commit - if the value should be written to the `config.json` file
     */
    public setDifficulty(difficulty: Difficulty, commit = false) {
        this.difficulty = difficultyName(difficulty);

        if (commit) this.configBuilder.set('difficulty', this.difficulty);
    }

    /**
     * Returns true or false depending on if online mode is enabled.
     *
     * @returns The message of the day as a `string`
     */
    public getMotd(): string {
        return this.motd;
    }

    /**
     * Set the motd.
     *
     * @param motd - the gamemode
     * @param commit - whether to write the value to the server config file
     */
    public setMotd(motd: string, commit = false) {
        this.motd = motd;

        if (commit) this.configBuilder.set('motd', this.motd);
    }

    /**
     * Returns the view distance.
     *
     * @returns The view distance as an `integer`
     */
    public getViewDistance(): number {
        return Math.round(this.viewDistance); // Make sure it's always an integer
    }

    /**
     * How many chunks around spawn are generated before the server accepts players.
     *
     * A radius of r generates (2r+1)^2 chunks, so the default 10 is 441 - about what the
     * first player will see. Zero skips the preload entirely and generates on demand.
     *
     * @returns The preload radius in chunks, as an `integer`
     */
    public getPreloadRadius(): number {
        return Math.max(0, Math.round(this.preloadRadius));
    }

    /**
     * How many worker threads chunk generation may use.
     *
     * Zero keeps generation on the server thread. The default reserves two cores for the server
     * and caps the rest at the number already measured to help generation.
     *
     * @returns A nonnegative integer worker count
     */
    public getChunkWorkers(): number {
        const workers = Number(this.chunkWorkers);
        return Number.isFinite(workers) ? Math.max(0, Math.trunc(workers)) : DEFAULTS['chunk-workers'];
    }

    /**
     * Where chunk generation workers run.
     *
     * `process`, the default, starts a separate generation process at a lowered operating system
     * priority and falls back to threads in the server process when it cannot. `in-process` keeps
     * the threads in the server process. Any other value is treated as the default.
     *
     * @returns `process` or `in-process`
     */
    public getChunkHost(): 'process' | 'in-process' {
        return this.chunkHost === 'in-process' ? 'in-process' : 'process';
    }

    /**
     * The configured `chunk-host` when it is neither `process` nor `in-process`, so the server can
     * say so instead of quietly using the default.
     *
     * @returns The rejected value, or undefined when the setting is valid.
     */
    public getInvalidChunkHost(): string | undefined {
        return this.chunkHost === 'process' || this.chunkHost === 'in-process' ? undefined : String(this.chunkHost);
    }

    /**
     * How many megabytes of generated terrain tiles the server keeps on disk.
     *
     * @returns A nonnegative integer; zero turns the cache off
     */
    public getTerrainCacheSizeMb(): number {
        const megabytes = Number(this.terrainCacheSizeMb);
        return Number.isFinite(megabytes) ? Math.max(0, Math.trunc(megabytes)) : DEFAULTS['terrain-cache-size-mb'];
    }

    /**
     * How long a tick may spend sending chunks, out of the 50 ms it has.
     *
     * The dial between how responsive the server stays and how fast the world appears.
     * Raising it loads chunks quicker at the cost of everything else the tick does.
     *
     * @returns The budget in milliseconds
     */
    public getChunkSendBudgetMs(): number {
        return Math.max(0, this.chunkSendBudgetMs);
    }

    /**
     * Whether positional packets are narrowed to the players near them.
     *
     * An escape hatch rather than a feature dial. Turning it off makes every positional
     * broadcast reach every player *in the same world* - it does not restore the server-wide
     * fan-out some of them used to have, which was a bug and not a behavior.
     *
     * @returns Whether proximity filtering is on
     */
    public getProximityBroadcast(): boolean {
        return this.proximityBroadcast;
    }

    /**
     * Who decides when a block a player is mining breaks.
     *
     * On, the default and what an unpinned Bedrock Dedicated Server announces: the server animates
     * the cracks every tick, and the client reports a break it predicts, which the server
     * carries out. Off, the client times the break itself and reports it once it is done.
     *
     * @returns Whether block breaking is server-authoritative
     */
    public getServerAuthoritativeBlockBreaking(): boolean {
        return this.serverAuthoritativeBlockBreaking;
    }

    /**
     * Whether Bedrock clients join with Education Edition features on.
     *
     * The setting fills `StartGame`'s `educationFeaturesEnabled`, the flag the Education toggle
     * in a world's settings writes. The client then accepts Education content such as the
     * chemistry blocks and items. Off, the default, matches a Bedrock Dedicated Server world.
     * The server implements no Education behavior of its own: chemistry workbenches still open
     * no screens.
     *
     * @returns Whether Education Edition features are on
     */
    public getEducationFeatures(): boolean {
        return this.educationFeatures;
    }

    /**
     * Which edition decides what a flowing fluid destroys.
     *
     * `java`, the default, follows Java 26.3's `FlowingFluid.canHoldFluid`: a fluid washes away
     * what `#minecraft:washed_away_by_fluids` lists and keeps out of every waterloggable block,
     * which only a water source enters, waterlogging it.
     * `bedrock` follows each block's Bedrock `liquidReactionOnTouch`. Any other value is treated
     * as the default.
     *
     * @returns `java` or `bedrock`
     */
    public getFluidReplacement(): FluidReplacement {
        return this.fluidReplacement === 'bedrock'
            ? 'bedrock'
            : this.fluidReplacement === 'java'
              ? 'java'
              : DEFAULT_FLUID_REPLACEMENT;
    }

    /**
     * Chunks past a viewer's own reach before a tracked entity is taken off their screen.
     *
     * The gap between the radius at which an entity appears and the one at which it goes
     * away. Without a gap, a player standing on the boundary makes every entity out there
     * appear and disappear on alternating passes.
     *
     * @returns The hysteresis in chunks, as an `integer`
     */
    public getEntityTrackingHysteresis(): number {
        return Math.max(0, Math.round(this.entityTrackingHysteresis));
    }

    /**
     * Ticks between entity visibility passes.
     *
     * Only governs entities moving towards a standing player - a player who moves crosses a
     * chunk boundary and forces a pass regardless. Entity types that declare a longer
     * interval of their own keep it; this is the floor.
     *
     * @returns The interval in ticks, at least 1
     */
    public getEntityTrackingInterval(): number {
        return Math.max(1, Math.round(this.entityTrackingInterval));
    }

    /**
     * How long between the pings that check a client is still there, for both editions, as
     * vanilla Java's fifteen seconds by default. A client that leaves one unanswered until the
     * next is disconnected.
     *
     * @returns The interval in milliseconds, or 0 for no pings
     */
    public getKeepAliveIntervalMs(): number {
        const seconds = Number(this.keepAliveInterval);
        return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0;
    }

    /**
     * Returns true or false depending on if online mode is enabled.
     *
     * @returns `true` if enabled, `false` otherwise
     */
    public getOnlineMode(): boolean {
        return this.onlineMode;
    }

    /**
     * Whether Bedrock players can earn Xbox achievements.
     *
     * On, the default, every player's `StartGame` says achievements are on and cheats are off,
     * which is what a Bedrock Dedicated Server with `allow-cheats=false` sends, and every command
     * goes out marked as not a cheat. An operator therefore keeps both their commands and their
     * achievements, which a Bedrock Dedicated Server does not allow. The client awards most
     * achievements itself from what it sees, and only while its own player is in survival or
     * adventure mode, so one player in creative mode costs nobody else an achievement. For the
     * few it cannot see, the server sends the `LegacyTelemetryEvent` packets BDS sends: a mob the
     * player's blow killed, the entity that killed the player, and a command that succeeded. Off,
     * the server announces cheats as on and achievements as disabled, as it did before the key,
     * and sends none of those events.
     *
     * @returns Whether Xbox achievements are on
     */
    public getXboxAchievements(): boolean {
        return this.xboxAchievements;
    }

    /** Whether only the players in `allowlist.json` may join, when the server starts. */
    public getAllowList(): boolean {
        return this.allowList;
    }

    /** Whether the server accepts clients over RakNet. */
    public getEnableRakNet(): boolean {
        return this.enableRakNet;
    }

    /** Whether RakNet UDP I/O and reliability updates run outside the game thread. */
    public getUseRakNetWorker(): boolean {
        return this.useRakNetWorker;
    }

    /** Whether the server accepts clients over NetherNet. */
    public getEnableNetherNet(): boolean {
        return this.enableNetherNet;
    }

    /** Whether the server answers Java Edition clients on {@link getJavaPort}. */
    public getJavaEnabled(): boolean {
        return this.javaEnabled;
    }

    /** The TCP port Java Edition clients connect to. */
    public getJavaPort(): number {
        return this.javaPort;
    }

    /** Whether players can link a Java Edition account and an Xbox account into one player. */
    public getAccountLinking(): boolean {
        return this.accountLinking;
    }

    /** The NetherNet UDP ports setting, unparsed, in Bedrock Dedicated Server's syntax; empty means the server port. */
    public getServerUdpPorts(): string {
        return this.serverUdpPorts;
    }

    /** The address NetherNet advertises, unparsed: a raw IPv4, a raw or bracketed IPv6, or empty. */
    public getServerPublicIp(): string {
        return this.serverPublicIp;
    }

    /**
     * Whether NetherNet looks up the server's public address when `server-public-ip` is empty, and
     * offers it to a player joining by address whose answer would otherwise carry no public address.
     */
    public getEnableServerPublicIpLookup(): boolean {
        return this.enableServerPublicIpLookup;
    }

    /** Whether the server answers clients looking for games on the local network. */
    public getEnableLanVisibility(): boolean {
        return this.enableLanVisibility;
    }

    /** Whether a player must take the installed addons' resource packs to join. */
    public getTexturepackRequired(): boolean {
        return this.texturepackRequired;
    }

    /** Whether joining Bedrock players are told to use another graphics setting than Vibrant Visuals. */
    public getDisableClientVibrantVisuals(): boolean {
        return this.disableClientVibrantVisuals;
    }

    /** The base URL Java clients download the converted resource pack from, or empty for the server's own Java port. */
    public getJavaResourcePackUrl(): string {
        return this.javaResourcePackUrl;
    }

    /**
     * The zlib level batches are compressed at, clamped to what zlib will actually accept.
     * See {@link toPacketCompressionLevel} for why the configured value is not trusted as is.
     */
    public getPacketCompressionLevel(): number {
        return toPacketCompressionLevel(this.packetCompressionLevel);
    }

    /**
     * The algorithm selected for new connections. Each `NetworkSettings` packet advertises it,
     * and the connection stores the same value for all later batches.
     */
    public getPacketCompressionAlgorithm(): PacketCompressionAlgorithm {
        switch (this.packetCompressionAlgorithm) {
            case 'snappy':
                return PacketCompressionAlgorithm.SNAPPY;
            case 'none':
                return PacketCompressionAlgorithm.NONE;
            default:
                return PacketCompressionAlgorithm.ZLIB;
        }
    }

    /** The minimum uncompressed batch-body size that is compressed and advertised to clients. */
    public getPacketCompressionThreshold(): number {
        return toPacketCompressionThreshold(this.packetCompressionThreshold);
    }

    /** Whether the unvalidated full-flush batch prototype is enabled for shared movement, blocks, and chunks. */
    public getPacketFullFlushFragments(): boolean {
        return this.packetFullFlushFragments;
    }

    /** Whether the server answers the GameSpy4 query protocol. */
    public getEnableQuery(): boolean {
        return this.enableQuery;
    }

    /**
     * The UDP port the query protocol answers on for Java Edition, as Java Edition's
     * `query.port`, 25565 when unset. Query answers for Bedrock on {@link getServerPort} as
     * well; a query port equal to it answers there alone.
     * @returns The query port.
     */
    public getQueryPort(): number {
        return this.queryPortSetting ?? DEFAULTS['query-port'];
    }

    /**
     * `query-port` as the config sets it.
     * @returns The port, or undefined when the config leaves it at its default.
     */
    public getQueryPortSetting(): number | undefined {
        return this.queryPortSetting;
    }

    /** The script watchdog's settings; see `script-watchdog-*` in the config file. */
    public getScriptWatchdog(): ScriptWatchdogConfig {
        return this.scriptWatchdog;
    }

    /** The script debugger's settings; see `script-debugger-*` and `*-script-debugging` in the config file. */
    public getScriptDebugger(): ScriptDebuggerConfig {
        return this.scriptDebugger;
    }

    public getEnableProcessTitle() {
        return this.enableProcessTitle;
    }

    public getEnableTicking() {
        return this.enableTicking;
    }

    /**
     * How many recipes to send: `-1` for every one, `0` for none, a positive number to cap.
     *
     * The `crafting-recipe-limit` config key, truncated to a whole number. This is how
     * `PlayerSession.sendCraftingData` reads it; the field above says why the two escape
     * hatches exist.
     * @returns {number} the limit.
     */
    public getCraftingRecipeLimit(): number {
        return Math.trunc(this.craftingRecipeLimit);
    }

    /**
     * Packet class names kept out of the traffic log.
     * @returns {string[]} the excluded names.
     */
    public getLogExcludedPackets(): string[] {
        return this.logExcludedPackets;
    }

    /**
     * The `stats.bstats` settings. `enabled` is off unless the file says `true` or has no section,
     * and a logging switch the file lacks or sets to something other than a boolean is off.
     * `endpoint` is bStats' own unless the file names another http or https URL.
     */
    public getBStatsSettings(): BStatsSettings {
        return this.bstatsSettings;
    }

    /**
     * The `updates` settings as the file holds them. A key it leaves out is undefined and follows
     * the build; `problems` lists what it holds that the server could not use.
     * @returns The settings.
     */
    public getUpdateSettings(): UpdateSettings {
        return this.updateSettings;
    }

    /**
     * Whether this start wrote the `stats.bstats` section into the config file, which is how the
     * server tells a first start with bStats from a later one. False when the file already had
     * the section, and when the file refused the write.
     */
    public wasBStatsSectionCreated(): boolean {
        return this.bstatsSectionCreated;
    }
}
