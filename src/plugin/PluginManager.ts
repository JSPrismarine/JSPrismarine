import fs from "fs";
import path from "path";
import { PluginManager as ModuleManager } from 'live-plugin-manager';
import Prismarine from "../prismarine";
import PluginFile, { Plugin } from "./PluginFile";

export default class PluginManager {
    private server: Prismarine;
    private pluginApiVersions = new Map();
    private plugins = new Map();

    constructor(server: Prismarine) {
        this.server = server;
    }

    public async onStart() {
        // Register PluginApiVersion(s)
        const pluginApiVersions = fs.readdirSync(path.join(__dirname, 'api/versions'));
        await Promise.all(pluginApiVersions.map((id: string) => {
            return this.registerPluginApiVersion(id);
        }));
        this.server.getLogger().debug(`Registered §b${pluginApiVersions.length}§r pluginApiVersion(s)!`);

        // Register Plugin(s)
        const plugins = fs.readdirSync(path.join(process.cwd(), 'plugins'));
        await Promise.all(plugins.map((id: string) => {
            return this.registerPlugin(id);
        }));
        this.server.getLogger().debug(`Registered §b${plugins.length}§r plugin(s)!`);
    }

    public async onExit() {
        this.pluginApiVersions.clear();
    }

    private async registerPluginApiVersion(id: string) {
        let dir = path.join(__dirname, 'api/versions', id);
        const PluginVersion = require(dir).default;
        this.pluginApiVersions.set(id, new PluginVersion())
        this.server.getLogger().silly(`PluginApiVersion with id §b${id}§r registered`);
    }

    private async registerPlugin(id: string) {
        let dir = path.join(process.cwd(), 'plugins', id);
        if (!fs.lstatSync(dir).isDirectory()) {
            // TODO: extract plugin into ./temp
        }

        const pkg = require(path.join(dir, 'package.json'));
        const modules = await Promise.all(Object.entries(pkg?.dependencies)?.map((dependency) => {
            const moduleManager = new ModuleManager({
                cwd: dir,
                pluginsPath: path.join(dir, 'node_modules')
            });
            return moduleManager.installFromNpm(dependency[0] as string, dependency[1] as string);
        }));

        const pluginApiVersion = this.getPluginApiVersion(pkg.prismarine.apiVersion);
        const plugin = new PluginFile(dir, pluginApiVersion);
        await plugin.onStart();

        this.plugins.set(pkg.name, plugin);

        this.server.getLogger().silly(`Plugin with id §b${plugin.getName()}@${plugin.getVersion()}§r registered`);
        this.server.getLogger().info(`Plugin §b${plugin.getDisplayName()} ${plugin.getVersion()}§r loaded successfully!`);
        // this.plugins.get(pkg.name)
    }
    private async deregisterPlugin(id: string) {
        const plugin: PluginFile = this.plugins.get(id);
        await plugin.onExit();

        this.plugins.delete(id);
    }

    private getPluginApiVersion(id: string) {
        // TODO
        return this.pluginApiVersions.get(id);
    }
    public getPlugins() {
        return Array.from(this.plugins.values());
    }
}
