import path from 'path';
import PluginApiVersion from './api/PluginApiVersion';

export class Plugin {
    constructor (api: PluginApiVersion) {}
    async onStart() {}
    async onExit() {}
};

export default class PluginFile {
    private path: string;
    private package;
    private plugin: Plugin;

    constructor(dir: string, pluginApiVersion: any) {
        this.path = dir;
        this.package = require(path.join(dir, 'package.json'))

        const Plugin = require(path.join(dir, this.package.main)).default;
        this.plugin = new Plugin(pluginApiVersion);
    }

    public getName() {
        return this.package.name;
    }
    public getDisplayName() {
        return this.package.prismarine.displayName;
    }
    public getVersion() {
        return this.package.version;
    }

    public async onStart() {
        await this.plugin.onStart();
    }
    public async onExit() {
        await this.plugin.onExit();
    }
};
