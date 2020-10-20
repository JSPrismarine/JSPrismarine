import path from 'path';
import ConfigBuilder from "../../../../config/ConfigBuilder";
import Prismarine from "../../../../prismarine";
import LoggerBuilder from "../../../../utils/Logger";
import PluginApiVersion from "../../PluginApiVersion";
import withDeprecated from '../../../hoc/withDeprecated';

export const PLUGIN_API_VERSION = '1.0';

/**
 * Provides generic server details such as motd, player-count etc.
 */
class ServerDetails {
    private server: Prismarine;

    constructor(server: Prismarine) {
        this.server = server;

    }

    public getMotd(): string {
        return this.server.getRaknet()?.name.getMotd() || this.server.getConfig().getMotd();
    }

    public getMaxPlayerCount(): number {
        return this.server.getConfig().getMaxPlayers();
    }
};

export default class PluginApi extends PluginApiVersion {
    private server: Prismarine;
    private pkg;

    constructor(server: Prismarine, pkg: any) {
        super(PLUGIN_API_VERSION);
        this.server = server;
        this.pkg = pkg;
    };
    public async onInit() { }
    public async onExit() { }

    /**
     * returns an instance of the logger builder class with the plugin name prefixed
     */
    public getLogger(): LoggerBuilder {
        const name = this.pkg.prismarine?.displayName || this.pkg.name;

        return {
            silly: (...args) => this.getServer().getLogger().silly(`[${name}] ${args}`),
            debug: (...args) => this.getServer().getLogger().debug(`[${name}] ${args}`),
            info: (...args) => this.getServer().getLogger().info(`[${name}] ${args}`),
            warn: (...args) => this.getServer().getLogger().warn(`[${name}] ${args}`),
            error: (...args) => this.getServer().getLogger().error(`[${name}] ${args}`),
        } as LoggerBuilder;
    }

    /**
     * returns an instance of the config builder class
     */
    public getConfigBuilder(configFile: string): ConfigBuilder {
        return new ConfigBuilder(path.join(process.cwd(), '/plugins/', this.pkg.name, configFile));
    }

    /**
     * returns an instance of the sever details class
     */
    public getServerDetails(): ServerDetails {
        return new ServerDetails(this.getServer());
    }

    @withDeprecated(new Date('2020-10-19'))
    public getPlayerManager() {
        return {
            getOnlinePlayers: () => {
                return this.server.getOnlinePlayers();
            },

            getPlayerByName: (name: string) => {
                return this.server.getPlayerByName(name);
            },
            getPlayerById: (id: number) => {
                return this.server.getPlayerById(id);
            },
        };
    }

    private getServer() {
        return this.server;
    }
};
