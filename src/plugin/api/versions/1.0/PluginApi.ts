import ConfigBuilder from '../../../../config/ConfigBuilder';
import EventManager from './EventManager';
import LoggerBuilder from '../../../../utils/Logger';
import PluginApiVersion from '../../PluginApiVersion';
import Prismarine from '../../../../Prismarine';
import path from 'path';

export const PLUGIN_API_VERSION = '1.0';

export default class PluginApi extends PluginApiVersion {
    private pkg;

    constructor(private server: Prismarine, pkg: any) {
        super(PLUGIN_API_VERSION);
        this.pkg = pkg;
    }
    public async onInit() {}
    public async onDisable() {}

    /**
     * returns an instance of the logger builder class with the plugin name prefixed
     */
    public getLogger(): LoggerBuilder {
        const name = this.pkg.prismarine?.displayName || this.pkg.name;

        return {
            silly: (...args) =>
                this.server.getLogger().silly(`[${name}] ${args}`),
            debug: (...args) =>
                this.server.getLogger().debug(`[${name}] ${args}`),
            info: (...args) =>
                this.server.getLogger().info(`[${name}] ${args}`),
            warn: (...args) =>
                this.server.getLogger().warn(`[${name}] ${args}`),
            error: (...args) =>
                this.server.getLogger().error(`[${name}] ${args}`)
        } as LoggerBuilder;
    }

    /**
     * returns an instance of the config builder class
     */
    public getConfigBuilder(configFile: string): ConfigBuilder {
        return new ConfigBuilder(
            path.join(process.cwd(), '/plugins/', this.pkg.name, configFile)
        );
    }

    /**
     * returns an instance of the server class
     */
    public getServer(): Prismarine {
        return this.server;
    }

    private eventManager: EventManager<[string, any]> | undefined = undefined;

    /**
     * returns an instance of the event manager
     */
    public getEventManager<
        CustomEventTypes extends [string, any] = [string, any]
    >(): EventManager<CustomEventTypes> {
        return (
            this.eventManager ??
            (this.eventManager = new EventManager(this.server))
        );
    }
}
