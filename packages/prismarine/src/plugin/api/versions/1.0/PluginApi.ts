import ConfigBuilder from '../../../../config/ConfigBuilder';
import EventManager from './EventManager';
import LoggerBuilder from '../../../../utils/Logger';
import PluginApiVersion from '../../PluginApiVersion';
import Server from '../../../../Server';
import cwd from '../../../../utils/cwd';
import path from 'path';

export const PLUGIN_API_VERSION = '1.0';

export default class PluginApi extends PluginApiVersion {
    private readonly pkg;

    public constructor(private readonly server: Server, pkg: any) {
        super(PLUGIN_API_VERSION);
        this.pkg = pkg;
    }

    public async onEnable() {}
    public async onDisable() {}

    /**
     * Returns an instance of the logger builder class with the plugin name prefixed
     */
    public getLogger(): LoggerBuilder {
        const name = this.pkg.prismarine?.displayName || this.pkg.name;

        return {
            silly: (...args) => {
                this.server.getLogger().debug(`[${name}] ${args}`, this.pkg.name);
            },
            debug: (...args) => {
                this.server.getLogger().verbose(`[${name}] ${args}`, this.pkg.name);
            },
            info: (...args) => {
                this.server.getLogger().info(`[${name}] ${args}`, this.pkg.name);
            },
            warn: (...args) => {
                this.server.getLogger().warn(`[${name}] ${args}`, this.pkg.name);
            },
            error: (...args) => {
                this.server.getLogger().error(`[${name}] ${args}`, this.pkg.name);
            }
        } as LoggerBuilder;
    }

    /**
     * Returns an instance of the config builder class
     */
    public getConfigBuilder(configFile: string): ConfigBuilder {
        if (configFile.startsWith('../../') || configFile.startsWith('/../../'))
            throw new Error(`config files should be kept in their respective plugin folder`);

        return new ConfigBuilder(path.join(cwd(), '/plugins/', this.pkg.name, configFile));
    }

    /**
     * Returns an instance of the server class
     */
    public getServer(): Server {
        return this.server;
    }

    private eventManager: EventManager<[string, any]> | undefined = undefined;

    /**
     * Returns an instance of the event manager
     */
    public getEventManager<CustomEventTypes extends [string, any] = [string, any]>(): EventManager<CustomEventTypes> {
        return this.eventManager ?? (this.eventManager = new EventManager(this.server));
    }
}
