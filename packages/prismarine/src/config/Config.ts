import { SeedGenerator } from '../utils/Seed';
import { cwd } from '../utils/cwd';
import { Gamemode } from '../world/';
import { ConfigBuilder } from './ConfigBuilder';

import path from 'node:path';

export class Config {
    private configBuilder!: ConfigBuilder;

    private port!: number;
    private serverIp!: string;
    private levelName!: string;
    private worlds!: any;
    private maxPlayers!: number;
    private gamemode!: string;
    private motd!: string;
    private viewDistance!: number;
    private onlineMode!: boolean;
    private packetCompressionLevel!: number;

    public constructor() {}

    public async enable(): Promise<void> {
        const isDev = process.env.NODE_ENV === 'development';

        this.configBuilder = new ConfigBuilder(path.resolve(cwd(), 'config.yaml'));
        global.logLevel = this.configBuilder.get('log-level', isDev ? 'verbose' : 'info');

        this.port = this.configBuilder.get('port', 19132) as number;
        this.serverIp = this.configBuilder.get('server-ip', '0.0.0.0') as string;
        this.levelName = this.configBuilder.get('level-name', 'world') as string;
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
    }

    public async disable(): Promise<void> {}

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
     * Set the default gamemode.
     *
     * @param gamemode - the gamemode
     * @param commit - if the value should be written to the `config.yml` file
     */
    public setGamemode(gamemode: number, commit = false) {
        this.gamemode = Gamemode.getGamemodeName(gamemode).toLowerCase();

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
}
