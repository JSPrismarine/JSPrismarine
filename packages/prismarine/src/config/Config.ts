import type { LogLevel } from '@jsprismarine/logger';
import { SeedGenerator } from '../utils/Seed';
import { withCwd } from '../utils/cwd';
import { ConfigBuilder } from './ConfigBuilder';

import { Difficulty, getGametypeName } from '@jsprismarine/minecraft';

const isDev = process.env.NODE_ENV === 'development';

const FILE_NAME = 'config.yaml';

/** The difficulty names a config file may use, as the protocol numbers them. */
const DIFFICULTIES: Readonly<Record<string, Difficulty>> = {
    peaceful: Difficulty.PEACEFUL,
    easy: Difficulty.EASY,
    normal: Difficulty.NORMAL,
    hard: Difficulty.HARD
};

/** What the server compresses at when the configured level is unusable. */
const DEFAULT_PACKET_COMPRESSION_LEVEL = 7;

export class Config {
    private configBuilder!: ConfigBuilder;

    private logLevel!: LogLevel;

    private port!: number;
    private serverIp!: string;
    private levelName!: string;
    private worlds!: any;
    private maxPlayers!: number;
    private gamemode!: string;
    private difficulty!: string;
    private motd!: string;
    private viewDistance!: number;
    private preloadRadius!: number;
    private chunkSendBudgetMs!: number;
    private proximityBroadcast!: boolean;
    private entityTrackingHysteresis!: number;
    private entityTrackingInterval!: number;
    private onlineMode!: boolean;
    private packetCompressionLevel!: number;

    /**
     * Controls if the minecraft/source query response should be enabled.
     */
    private enableQuery: boolean = true;

    /**
     * Controls if the process title should be updated.
     * @remarks this can cause performance issues in some terminals.
     */
    private enableProcessTitle: boolean = true;

    /**
     * Controls if the ticking should be enabled.
     */
    private enableTicking: boolean = true;

    /**
     * Packets left out of the traffic log, by class name.
     *
     * At `silly` level every packet in and out is written down, and the ones on a timer -
     * `SetTimePacket` goes to every player twenty times a second - bury everything else.
     * Excluding them by name is the only way to keep the rest.
     */
    private logExcludedPackets: string[] = ['SetTimePacket'];

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
    private craftingRecipeLimit = -1;

    public constructor() {
        this.configBuilder = new ConfigBuilder(withCwd(FILE_NAME));
        this.logLevel = this.configBuilder.get('log-level', isDev ? 'verbose' : 'info');
    }

    /**
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        this.configBuilder = new ConfigBuilder(withCwd(FILE_NAME));
        this.logLevel = this.configBuilder.get('log-level', isDev ? 'verbose' : 'info');
        this.port = this.configBuilder.get('port', 19132) as number;
        this.serverIp = this.configBuilder.get('server-ip', '0.0.0.0') as string;
        this.levelName = this.configBuilder.get('level-name', 'world') as string;
        this.worlds = this.configBuilder.get('worlds', {
            world: {
                generator: 'Flat',
                provider: 'LevelDB',
                seed: SeedGenerator()
            }
        });
        this.maxPlayers = this.configBuilder.get('max-players', 20) as number;
        this.gamemode = this.configBuilder.get('gamemode', 'survival') as string;
        this.difficulty = this.configBuilder.get('difficulty', 'normal') as string;
        this.motd = this.configBuilder.get('motd', 'Another JSPrismarine server!') as string;
        this.viewDistance = this.configBuilder.get('view-distance', 10) as number;
        this.preloadRadius = this.configBuilder.get('preload-radius', 10) as number;
        this.chunkSendBudgetMs = this.configBuilder.get('chunk-send-budget-ms', 5) as number;
        this.proximityBroadcast = this.configBuilder.get('proximity-broadcast', true) as boolean;
        this.entityTrackingHysteresis = this.configBuilder.get('entity-tracking-hysteresis', 2) as number;
        this.entityTrackingInterval = this.configBuilder.get('entity-tracking-interval', 4) as number;
        this.onlineMode = this.configBuilder.get('online-mode', false) as boolean;
        this.packetCompressionLevel = this.configBuilder.get(
            'packet-compression-level',
            DEFAULT_PACKET_COMPRESSION_LEVEL
        ) as number;
        this.enableQuery = this.configBuilder.get('enable-query', this.enableQuery) as typeof this.enableQuery;
        this.enableProcessTitle = this.configBuilder.get(
            'enable-process-title',
            this.enableProcessTitle
        ) as typeof this.enableProcessTitle;
        this.enableTicking = this.configBuilder.get('enable-ticking', this.enableTicking) as typeof this.enableTicking;
        this.logExcludedPackets = this.configBuilder.get(
            'log-excluded-packets',
            this.logExcludedPackets
        ) as typeof this.logExcludedPackets;
        this.craftingRecipeLimit = this.configBuilder.get('crafting-recipe-limit', this.craftingRecipeLimit) as number;
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

    public getWorlds(): any {
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
     * config nobody can read is how a server ends up on the wrong one. An unrecognised name falls
     * back to normal instead of refusing to start - a typo should not take a server down.
     * @returns {Difficulty} The configured difficulty.
     */
    public getDifficulty(): Difficulty {
        return DIFFICULTIES[this.difficulty?.toLowerCase()] ?? Difficulty.NORMAL;
    }

    /**
     * Set the default gamemode.
     *
     * @param gamemode - the gamemode
     * @param commit - if the value should be written to the `config.yml` file
     */
    public setGamemode(gamemode: number, commit = false) {
        this.gamemode = getGametypeName(gamemode);
        if (commit) this.configBuilder.set('gamemode', this.gamemode);
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
     * @param commit - if the value should be written to the `config.yml` file
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
     * fan-out some of them used to have, which was a bug and not a behaviour.
     *
     * @returns Whether proximity filtering is on
     */
    public getProximityBroadcast(): boolean {
        return this.proximityBroadcast;
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
     *
     * zlib takes -1 (its own default) through 9 and errors on anything else. The value comes
     * straight out of a hand edited config file, and an unchecked `10` reached deflate as a
     * rejection on the chunk sending path - which is nowhere near where the typo was, and
     * used to take the server's tick down with it. Clamping keeps a bad number a bad number
     * rather than an outage.
     */
    public getPacketCompressionLevel(): number {
        const level = Number(this.packetCompressionLevel);
        if (!Number.isInteger(level)) return DEFAULT_PACKET_COMPRESSION_LEVEL;

        return Math.min(9, Math.max(-1, level));
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
     * How many recipes to send, or `0` for all.
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
