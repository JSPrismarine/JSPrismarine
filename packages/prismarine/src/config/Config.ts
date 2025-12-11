import type { LogLevel } from '@jsprismarine/logger';
import { SeedGenerator } from '../utils/Seed';
import { withCwd } from '../utils/cwd';
import { ConfigBuilder } from './ConfigBuilder';

import { getGametypeName } from '@jsprismarine/minecraft';

const isDev = process.env.NODE_ENV === 'development';

const FILE_NAME = 'config.yaml';

export class Config {
    private configBuilder!: ConfigBuilder;

    private logLevel!: LogLevel;

    private port!: number;
    private serverIp!: string;
    private worldName!: string;
    private worlds!: any;
    private maxPlayers!: number;
    private gamemode!: string;
    private motd!: string;
    private viewDistance!: number;
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
        this.worldName = this.configBuilder.get('world-name', 'world') as string;
        this.worlds = this.configBuilder.get('worlds', {
            world: {
                generator: 'Flat',
                provider: 'Filesystem',
                seed: SeedGenerator()
            }
        });
        this.maxPlayers = this.configBuilder.get('max-players', 20) as number;
        this.gamemode = this.configBuilder.get('gamemode', 'survival') as string;
        this.motd = this.configBuilder.get('motd', 'Another JSPrismarine server!') as string;
        this.viewDistance = this.configBuilder.get('view-distance', 10) as number;
        this.onlineMode = this.configBuilder.get('online-mode', false) as boolean;
        this.packetCompressionLevel = this.configBuilder.get('packet-compression-level', 7) as number;
        this.enableQuery = this.configBuilder.get('enable-query', this.enableQuery) as typeof this.enableQuery;
        this.enableProcessTitle = this.configBuilder.get(
            'enable-process-title',
            this.enableProcessTitle
        ) as typeof this.enableProcessTitle;
        this.enableTicking = this.configBuilder.get('enable-ticking', this.enableTicking) as typeof this.enableTicking;
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
    public getWorldName(): string {
        return this.worldName;
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
     * Returns true or false depending on if online mode is enabled.
     *
     * @returns `true` if enabled, `false` otherwise
     */
    public getOnlineMode(): boolean {
        return this.onlineMode;
    }

    public getPacketCompressionLevel() {
        return this.packetCompressionLevel;
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
}
