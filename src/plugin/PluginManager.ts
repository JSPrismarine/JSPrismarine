import fs from "fs";
import path from "path";
import { PluginManager as ModuleManager } from 'live-plugin-manager';
import Prismarine from "../prismarine";
import PluginFile from "./PluginFile";
import PluginApiVersion from "./api/PluginApiVersion";

export default class PluginManager {
    private server: Prismarine;
    private pluginApiVersions = new Map();
    private plugins = new Map();

    constructor(server: Prismarine) {
        this.server = server;
    }

    /**
     * onStart hook
     */
    public async onStart() {
        // Register PluginApiVersion(s)
        const pluginApiVersions = fs.readdirSync(path.join(__dirname, 'api/versions'));
        await Promise.all(pluginApiVersions.map((id: string) => {
            try {
                return this.registerPluginApiVersion(id);
            } catch (err) {
                this.server.getLogger().error(`§cFailed to load pluginApiVersion ${id}: ${err}`);
            }
        }));
        this.server.getLogger().debug(`Registered §b${pluginApiVersions.length}§r pluginApiVersion(s)!`);

        // Register Plugin(s)
        const plugins = fs.readdirSync(path.join(process.cwd(), 'plugins'));
        await Promise.all(plugins.map(async (id: string) => {
            try {
                await this.registerPlugin(id);
            } catch (err) {
                this.server.getLogger().error(`§cFailed to load plugin ${id}: ${err}`);
            }
        }));
        this.server.getLogger().debug(`Registered §b${plugins.length}§r plugin(s)!`);
    }

    /**
     * onExit hook
     */
    public async onExit() {
        await Promise.all(Array.from(this.plugins.keys()).map((id: string) => {
            return this.deregisterPlugin(id);
        }));
        this.pluginApiVersions.clear();
    }

    /**
     * Register a pluginApiVersion
     */
    private async registerPluginApiVersion(id: string) {
        let dir = path.join(__dirname, 'api/versions', id);
        const PluginVersion = require(dir).default;
        this.pluginApiVersions.set(id, new PluginVersion(this.server))
        this.server.getLogger().silly(`PluginApiVersion with id §b${id}§r registered`);
    }

    /**
     * Register a new plugin and download the required dependencies
     */
    private async registerPlugin(id: string) {
        let dir = path.join(process.cwd(), 'plugins', id);
        if (!fs.lstatSync(dir).isDirectory()) {
            // TODO: extract plugin into ./temp
            dir = path.join(process.cwd(), 'plugins/.temp/', id);
            throw new Error(`.jspz plugin support is UNIMPLEMENTED`);
        }

        const pkg = require(path.join(dir, 'package.json'));
        if (!pkg)
            throw new Error(`package.json is invalid or missing!`);

        if (pkg.dependencies)
            await Promise.all(Object.entries(pkg?.dependencies)?.map((dependency) => {
                const moduleManager = new ModuleManager({
                    cwd: dir,
                    pluginsPath: path.join(dir, 'node_modules')
                });
                return moduleManager.installFromNpm(dependency[0] as string, dependency[1] as string);
            }));

        if (!pkg?.prismarine?.apiVersion)
            throw new Error(`apiVersion is missing in package.json!`);

        const pluginApiVersion = this.getPluginApiVersion(pkg.prismarine.apiVersion);
        if (!pluginApiVersion)
            throw new Error(`Invalid PluginApiVersion ${pkg.prismarine.apiVersion}!`);

        const plugin = new PluginFile(this.server, dir, pluginApiVersion);
        await plugin.onStart();

        this.plugins.set(pkg.name, plugin);

        this.server.getLogger().silly(`Plugin with id §b${plugin.getName()}@${plugin.getVersion()}§r registered`);
        this.server.getLogger().info(`Plugin §b${plugin.getDisplayName()} ${plugin.getVersion()}§r loaded successfully!`);
    }

    /**
     * Deregister a plugin
     */
    private async deregisterPlugin(id: string) {
        const plugin: PluginFile = this.plugins.get(id);
        await plugin.onExit?.();

        this.plugins.delete(id);
    }

    /**
     * Get a specific pluginApiVersion.
     * NOTE: the minor version returned may be higher but NEVER lower.
     */
    private getPluginApiVersion(id: string): PluginApiVersion {
        const version = this.pluginApiVersions.get(id);
        if (version)
            return version;

        // Try to use a higher minor version instead
        return Array.from(this.pluginApiVersions.values()).filter((apiVersion: PluginApiVersion) =>
            apiVersion.getVersion().split('.')[0] === id.split('.')[0]
            && apiVersion.getVersion().split('.')[1] >= id.split('.')[1]
        )[0];

    }

    /**
     * Return enabled plugins
     */
    public getPlugins() {
        return Array.from(this.plugins.values());
    }
}
