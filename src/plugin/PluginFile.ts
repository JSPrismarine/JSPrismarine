import path from 'path';
import Prismarine from '../Prismarine';
import PluginApiVersion from './api/PluginApiVersion';

export class Plugin {
    constructor(api: PluginApiVersion) {}
    async onEnable() {}
    async onDisable() {}
}

export default class PluginFile {
    private server: Prismarine;
    private path: string;
    private package;
    private plugin: Plugin;

    private name: string;
    private displayName: string;
    private version: string;

    constructor(
        server: Prismarine,
        dir: string,
        pluginApiVersion: PluginApiVersion
    ) {
        this.server = server;
        this.path = dir;
        this.package = require(path.join(this.path, 'package.json'));

        if (!this.package.name)
            throw new Error('name is missing in package.json!');
        else if (!this.package.version)
            throw new Error('version is missing in package.json!');
        else if (!this.package.prismarine.displayName)
            this.server
                .getLogger()
                .debug(
                    `Plugin with id ${this.package.name}@${this.package.version} is missing displayName!`
                );

        this.name = this.package.name;
        this.displayName = this.package.prismarine?.name || this.name;
        this.version = this.package.version;

        const Plugin = require(path.join(this.path, this.package.main)).default;
        this.plugin = new Plugin(pluginApiVersion);
    }

    /**
     * returns the plugin's name
     */
    public getName() {
        return this.name;
    }

    /**
     * returns the plugin's display name
     */
    public getDisplayName() {
        return this.displayName;
    }

    /**
     * returns the plugin's version
     */
    public getVersion() {
        return this.version;
    }

    public async onEnable() {
        await this.plugin.onEnable();
    }
    public async onDisable() {
        await this.plugin.onDisable();
    }
}
