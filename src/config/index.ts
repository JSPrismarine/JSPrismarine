import path from 'path';
import ConfigBuilder from "./ConfigBuilder";

export default class Config {
    private configBuilder: ConfigBuilder;

    private port: number;
    private serverIp: string;
    private levelName: string;
    private worlds: any;
    private maxPlayers: number;
    private gamemode: string | number;
    private motd: string;
    private viewDistance: number;
    private enableQuery: boolean;
    private queryPort: number;

    constructor() {
        this.configBuilder = new ConfigBuilder(path.join(process.cwd(), 'config.yaml'));
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
        this.motd = this.configBuilder.get('motd', 'Another JSPrismarine server!');
        this.viewDistance = this.configBuilder.get('view-distance', 10);
        this.enableQuery = this.configBuilder.get('enable-query', false);
        this.queryPort = this.configBuilder.get('query-port', 25565);
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
    public getEnableQuery() {
        return this.enableQuery;
    }
    public getQueryPort() {
        return this.queryPort;
    }
};
