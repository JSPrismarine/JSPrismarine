import path from 'path';
import ConfigBuilder from './ConfigBuilder';
import pkg from '../../package.json';

export default class Config {
    private configBuilder: ConfigBuilder;

    private version: string;
    private port: number;
    private serverIp: string;
    private levelName: string;
    private worlds: any;
    private maxPlayers: number;
    private gamemode: string;
    private motd: string;
    private viewDistance: number;
    private onlineMode: boolean;
    private enableEval: boolean;
    private enableTelemetry: boolean;
    private telemetryUrls: Array<string>;
    private packetCompressionLevel: number;

    constructor() {
        this.version = pkg.version;

        this.configBuilder = new ConfigBuilder(
            path.join(process.cwd(), 'config.yaml')
        );
        (global as any).log_level = this.configBuilder.get('log-level', 'info');

        this.port = this.configBuilder.get('port', 19132);
        this.serverIp = this.configBuilder.get('server-ip', '0.0.0.0');
        this.levelName = this.configBuilder.get('level-name', 'world');
        this.worlds = this.configBuilder.get('worlds', {
            world: {
                generator: 'overworld',
                seed: 1234 // TODO: generate random seed
            }
        });
        this.maxPlayers = this.configBuilder.get('max-players', 20);
        this.gamemode = this.configBuilder.get('gamemode', 'survival');
        this.motd = this.configBuilder.get(
            'motd',
            'Another JSPrismarine server!'
        );
        this.viewDistance = this.configBuilder.get('view-distance', 10);
        this.onlineMode = this.configBuilder.get('online-mode', true);
        this.enableEval = this.configBuilder.get('enable-eval', false);
        this.enableTelemetry = this.configBuilder.get('enable-telemetry', true);
        this.telemetryUrls = this.configBuilder.get('telemetry-urls', [
            'https://telemetry.prismarine.dev'
        ]);
        this.packetCompressionLevel = this.configBuilder.get('packet-compression-level', 7);
    }

    public getVersion() {
        return this.version;
    }
    public getPort() {
        return this.port;
    }
    public getServerIp() {
        return this.serverIp;
    }
    public getLevelName() {
        return this.levelName;
    }
    public getWorlds() {
        return this.worlds;
    }
    public getMaxPlayers() {
        return this.maxPlayers;
    }
    public getGamemode() {
        return this.gamemode;
    }
    public getMotd() {
        return this.motd;
    }
    public getViewDistance() {
        return this.viewDistance;
    }
    public getOnlineMode() {
        return this.onlineMode;
    }
    public getEnableEval() {
        return this.enableEval;
    }
    public getTelemetry() {
        return {
            enabled: this.enableTelemetry,
            urls: this.telemetryUrls
        };
    }
    public getPacketCompressionLevel() {
        return this.packetCompressionLevel;
    }
}
