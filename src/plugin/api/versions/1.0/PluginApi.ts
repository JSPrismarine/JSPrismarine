import path from 'path';
import ConfigBuilder from "../../../../config/ConfigBuilder";
import Prismarine from "../../../../Prismarine";
import LoggerBuilder from "../../../../utils/Logger";
import PluginApiVersion from "../../PluginApiVersion";
import withDeprecated from '../../../hoc/withDeprecated';
import Server from './Server';
import EventManager from './EventManager';
import PlayerManager from './PlayerManager';

export const PLUGIN_API_VERSION = '1.0';

export default class PluginApi extends PluginApiVersion {
    private pkg;

    constructor(private server: Prismarine, pkg: any) {
        super(PLUGIN_API_VERSION);
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
            silly: (...args) => this.server.getLogger().silly(`[${name}] ${args}`),
            debug: (...args) => this.server.getLogger().debug(`[${name}] ${args}`),
            info: (...args) => this.server.getLogger().info(`[${name}] ${args}`),
            warn: (...args) => this.server.getLogger().warn(`[${name}] ${args}`),
            error: (...args) => this.server.getLogger().error(`[${name}] ${args}`),
        } as LoggerBuilder;
    }

    /**
     * returns an instance of the config builder class
     */
    public getConfigBuilder(configFile: string): ConfigBuilder {
        return new ConfigBuilder(path.join(process.cwd(), '/plugins/', this.pkg.name, configFile));
    }

    /**
     * returns an instance of the server class
     */
    public getServer(): Server {
        return new Server(this.server);
    }

    private eventManager: EventManager<[string, any]> | undefined = undefined;

    /**
     * returns an instance of the event manager
     */
    public getEventManager<CustomEventTypes extends [string, any] = [string, any]>(): EventManager<CustomEventTypes> {

        if (this.eventManager === undefined) {
            this.eventManager = new EventManager(this.server);
        }

        return this.eventManager;

    }

    /**
     * returns an instance of the event manager
     */
    public getPlayerManager(): PlayerManager {
        return new PlayerManager(this.server);
    }

    /**
     * returns an instance of the sever details class
     */
    @withDeprecated(new Date('2020-10-20'))
    public getServerDetails(): Server {
        return new Server(this.server);
    }
};
