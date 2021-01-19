import PluginApiVersion from './api/PluginApiVersion';
import Server from '../Server';
import path from 'path';

export class Plugin {
    public constructor(api: PluginApiVersion) {}
    public async onEnable() {}
    public async onDisable() {}
}

export default class PluginFile {
    private readonly server: Server;
    private readonly path: string;
    private readonly package;
    private readonly plugin: Plugin;

    private readonly name: string;
    private readonly displayName: string;
    private readonly version: string;

    public constructor(
        server: Server,
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
        else if (!this.package.main)
            throw new Error('main is missing in package.json!');
        else if (!this.package.prismarine.displayName)
            this.server
                .getLogger()
                .debug(
                    `Plugin with id ${this.package.name}@${this.package.version} is missing displayName!`
                );

        this.name = this.package.name;
        this.displayName = this.package.prismarine.name ?? this.name;
        this.version = this.package.version;

        const Plugin = require(path.join(this.path, this.package.main)).default;
        this.plugin = new Plugin(pluginApiVersion);
    }

    /**
     * Returns the plugin's name
     */
    public getName() {
        return this.name;
    }

    /**
     * Returns the plugin's display name
     */
    public getDisplayName() {
        return this.displayName;
    }

    /**
     * Returns the plugin's version
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
