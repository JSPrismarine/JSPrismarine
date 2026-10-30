import type { LogLevel } from '@jsprismarine/logger';
import { SeedGenerator } from '../utils/Seed';
import { withCwd } from '../utils/cwd';
import type { WorldData } from '../world/WorldManager';
import { ConfigBuilder } from './ConfigBuilder';
import { CONFIG_KEY_ORDER } from './JsonConfigTypes';
import type { ConfigDifficulty, ConfigFile, ContentConfigKey } from './JsonConfigTypes';

import { Difficulty, getGametypeName } from '@jsprismarine/minecraft';

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

/**
 * What each key means, written above it the first time the server adds it to the file.
 *
 * Kept beside the keys rather than in a separate document so a key cannot gain a meaning
 * the file does not explain. The getter JSDoc below says the same things at more length for
 * code that reads them.
 */
const COMMENTS = {
    'log-level': 'How much the console and the log file say: error, warn, info, verbose, debug or silly.',
    port: 'The UDP port the server listens on. Bedrock clients look for 19132.',
    'server-ip': 'The address to listen on. 0.0.0.0 accepts connections on every interface.',
    'level-name': 'Which entry of `worlds` players join.',
    worlds: 'Every world the server loads, by name, with its generator, provider and seed. Write the seed as a string; a 64-bit seed written as a number is rounded.',
    'max-players': 'How many players may be online at once.',
    gamemode: 'The default game mode for new players: survival, creative, adventure or spectator.',
    difficulty: 'How dangerous the monsters are: peaceful, easy, normal or hard.',
    motd: 'The message shown in the server list.',
    'view-distance': 'How far players see, in chunks.',
    'preload-radius': 'How many chunks around spawn to generate before accepting players. 0 skips it.',
    'chunk-send-budget-ms': 'How long each tick may spend sending chunks, out of its 50 ms.',
    'proximity-broadcast': 'Whether positional packets only go to players near them. Turn off only to debug.',
    'server-authoritative-block-breaking':
        'Whether the server times block breaking, as a Bedrock Dedicated Server does. Off leaves it to the client.',
    'entity-tracking-hysteresis': "Chunks past view distance before an entity leaves a player's screen.",
    'entity-tracking-interval': 'Ticks between entity visibility passes, at least 1.',
    'online-mode': 'Whether players must be signed in to Xbox Live.',
    'packet-compression-level': "The zlib level for outgoing batches, from -1 (zlib's default) to 9.",
    'enable-query': 'Whether to answer the Minecraft and Source query protocols.',
    'enable-process-title': 'Whether to show the tick rate in the process title. Some terminals redraw slowly.',
    'enable-ticking': 'Whether the world ticks. Off is only useful for tests.',
    'log-excluded-packets': 'Packet class names kept out of the traffic log at the silly level.',
    'crafting-recipe-limit': 'How many recipes to send: -1 for all, 0 for none, or a cap.'
} as const satisfies Record<Exclude<keyof ConfigFile, ContentConfigKey>, string>;

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
    'log-level': isDev ? 'verbose' : 'info',
    port: 19132,
    'server-ip': '0.0.0.0',
    'level-name': 'world',
    'max-players': 20,
    gamemode: 'survival',
    difficulty: 'normal',
    motd: 'Another JSPrismarine server!',
    'view-distance': 10,
    'preload-radius': 10,
    'chunk-send-budget-ms': 5,
    'proximity-broadcast': true,
    'server-authoritative-block-breaking': true,
    'entity-tracking-hysteresis': 2,
    'entity-tracking-interval': 4,
    'online-mode': true,
    'packet-compression-level': DEFAULT_PACKET_COMPRESSION_LEVEL,
    'enable-query': true,
    'enable-process-title': true,
    'enable-ticking': true,
    'log-excluded-packets': [],
    'crafting-recipe-limit': -1
} as const satisfies Omit<Record<keyof typeof COMMENTS, unknown>, 'worlds'>;

/**
 * The single flat world a server with no `worlds` key runs, on a seed of its own.
 *
 * The seed is written as a string because it is a 64-bit value and a JSON number is a double:
 * written as a number, half the seeds this draws would be read back rounded. See
 * {@link import('./JsonConfigTypes').WorldData.seed}.
 */
const defaultWorlds = (): Record<string, WorldData> => ({
    world: { generator: 'Overworld', provider: 'LevelDB', seed: SeedGenerator().toString() }
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

export class Config {
    private configBuilder!: ConfigBuilder;

    private readonly serverPortOverride: number | undefined;

    private logLevel: LogLevel = DEFAULTS['log-level'];

    private port: number = DEFAULTS.port;
    private serverIp: string = DEFAULTS['server-ip'];
    private levelName: string = DEFAULTS['level-name'];
    private worlds: Record<string, WorldData> = defaultWorlds();
    private maxPlayers: number = DEFAULTS['max-players'];
    private gamemode: string = DEFAULTS.gamemode;
    private difficulty: string = DEFAULTS.difficulty;
    private motd: string = DEFAULTS.motd;
    private viewDistance: number = DEFAULTS['view-distance'];
    private preloadRadius: number = DEFAULTS['preload-radius'];
    private chunkSendBudgetMs: number = DEFAULTS['chunk-send-budget-ms'];
    private proximityBroadcast: boolean = DEFAULTS['proximity-broadcast'];
    private serverAuthoritativeBlockBreaking: boolean = DEFAULTS['server-authoritative-block-breaking'];
    private entityTrackingHysteresis: number = DEFAULTS['entity-tracking-hysteresis'];
    private entityTrackingInterval: number = DEFAULTS['entity-tracking-interval'];
    private onlineMode: boolean = DEFAULTS['online-mode'];
    private packetCompressionLevel: number = DEFAULTS['packet-compression-level'];

    /**
     * Controls if the minecraft/source query response should be enabled.
     */
    private enableQuery: boolean = DEFAULTS['enable-query'];

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

    /**
     * Creates the server configuration.
     *
     * @param options - runtime values that override settings in the server config file.
     */
    public constructor({ serverPort }: ConfigOptions = {}) {
        this.serverPortOverride = serverPort;
        this.configBuilder = new ConfigBuilder(configFilePath(), CONFIG_KEY_ORDER);
        this.logLevel = this.configBuilder.get('log-level', DEFAULTS['log-level'], COMMENTS['log-level']);
    }

    /**
     * On enable hook.
     *
     * Reads every setting, writing the default and its comment into the file for any key the
     * file does not have yet. A file from an older version therefore gains the new keys,
     * explained, without losing anything a person wrote in it.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        const config = new ConfigBuilder(configFilePath(), CONFIG_KEY_ORDER);
        this.configBuilder = config;
        const read = <T>(key: keyof typeof COMMENTS, defaults: T): T => config.get(key, defaults, COMMENTS[key]);

        this.logLevel = read('log-level', DEFAULTS['log-level']);
        this.port = read('port', DEFAULTS.port);
        if (this.serverPortOverride !== undefined) this.port = this.serverPortOverride;
        this.serverIp = read('server-ip', DEFAULTS['server-ip']);
        this.levelName = read('level-name', DEFAULTS['level-name']);
        this.worlds = read<Record<string, WorldData>>('worlds', this.worlds);
        this.maxPlayers = read('max-players', DEFAULTS['max-players']);
        this.gamemode = read('gamemode', DEFAULTS.gamemode);
        this.difficulty = read('difficulty', DEFAULTS.difficulty);
        this.motd = read('motd', DEFAULTS.motd);
        this.viewDistance = read('view-distance', DEFAULTS['view-distance']);
        this.preloadRadius = read('preload-radius', DEFAULTS['preload-radius']);
        this.chunkSendBudgetMs = read('chunk-send-budget-ms', DEFAULTS['chunk-send-budget-ms']);
        this.proximityBroadcast = read('proximity-broadcast', DEFAULTS['proximity-broadcast']);
        this.serverAuthoritativeBlockBreaking = read(
            'server-authoritative-block-breaking',
            DEFAULTS['server-authoritative-block-breaking']
        );
        this.entityTrackingHysteresis = read('entity-tracking-hysteresis', DEFAULTS['entity-tracking-hysteresis']);
        this.entityTrackingInterval = read('entity-tracking-interval', DEFAULTS['entity-tracking-interval']);
        this.onlineMode = read('online-mode', DEFAULTS['online-mode']);
        this.packetCompressionLevel = read('packet-compression-level', DEFAULTS['packet-compression-level']);
        this.enableQuery = read('enable-query', this.enableQuery);
        this.enableProcessTitle = read('enable-process-title', this.enableProcessTitle);
        this.enableTicking = read('enable-ticking', this.enableTicking);
        this.logExcludedPackets = read('log-excluded-packets', this.logExcludedPackets);
        this.craftingRecipeLimit = read('crafting-recipe-limit', this.craftingRecipeLimit);
    }

    /**
     * On disable hook.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {}

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
     * @param gamemode - the gamemode
     * @param commit - whether to write the value to the server config file
     */
    public setGamemode(gamemode: number, commit = false) {
        this.gamemode = getGametypeName(gamemode);
        if (commit) this.configBuilder.set('gamemode', this.gamemode);
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
     * On, the default and what a Bedrock Dedicated Server 1.26.52 announces: the server animates
     * the cracks every tick, and the client reports a break it predicts, which the server
     * carries out. Off, the client times the break itself and reports it once it is done.
     *
     * @returns Whether block breaking is server-authoritative
     */
    public getServerAuthoritativeBlockBreaking(): boolean {
        return this.serverAuthoritativeBlockBreaking;
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
     * Returns true or false depending on if online mode is enabled.
     *
     * @returns `true` if enabled, `false` otherwise
     */
    public getOnlineMode(): boolean {
        return this.onlineMode;
    }

    /**
     * The zlib level batches are compressed at, clamped to what zlib will actually accept.
     * See {@link toPacketCompressionLevel} for why the configured value is not trusted as is.
     */
    public getPacketCompressionLevel(): number {
        return toPacketCompressionLevel(this.packetCompressionLevel);
    }

    public getEnableQuery() {
        return this.enableQuery;
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
}
