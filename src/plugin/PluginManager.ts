import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';
import { PluginManager as ModuleManager } from 'live-plugin-manager';
import Prismarine from '../Prismarine';
import PluginFile from './PluginFile';
import PluginApiVersion from './api/PluginApiVersion';

export default class PluginManager {
    private server: Prismarine;
    private pluginApiVersions = new Map();
    private plugins = new Map();

    constructor(server: Prismarine) {
        this.server = server;
    }

    /**
     * onEnable hook
     */
    public async onEnable() {
        // Create plugin folder
        if (!fs.existsSync(process.cwd() + '/plugins')) {
            fs.mkdirSync(process.cwd() + '/plugins');
        }

        // Register PluginApiVersion(s)
        let time = Date.now();
        const pluginApiVersions = fs.readdirSync(
            path.join(__dirname, 'api/versions')
        );
        await Promise.all(
            pluginApiVersions.map((id: string) => {
                try {
                    return this.registerPluginApiVersion(id);
                } catch (err) {
                    this.server
                        .getLogger()
                        .error(
                            `§cFailed to load pluginApiVersion ${id}: ${err}`
                        );
                }
            })
        );
        this.server
            .getLogger()
            .debug(
                `Registered §b${
                    pluginApiVersions.length
                }§r pluginApiVersion(s) (took ${Date.now() - time} ms)!`
            );

        // Register Plugin(s)
        time = Date.now();
        const plugins = fs.readdirSync(path.join(process.cwd(), 'plugins'));
        const res = (
            await Promise.all(
                plugins.map(async (id: string) => {
                    try {
                        return await this.registerPlugin(id);
                    } catch (err) {
                        this.server
                            .getLogger()
                            .error(`§cFailed to load plugin ${id}: ${err}`);
                    }
                })
            )
        ).filter((a) => a);
        this.server
            .getLogger()
            .debug(
                `Registered §b${res.length}§r plugin(s) (took ${
                    Date.now() - time
                } ms)!`
            );
    }

    /**
     * onDisable hook
     */
    public async onDisable() {
        await Promise.all(
            Array.from(this.plugins.keys()).map((id: string) => {
                return this.deregisterPlugin(id);
            })
        );
        this.pluginApiVersions.clear();
    }

    /**
     * Register a pluginApiVersion
     */
    private async registerPluginApiVersion(id: string) {
        let dir = path.join(__dirname, 'api/versions', id, 'PluginApi');
        let PluginVersion = require(dir).default;

        this.pluginApiVersions.set(id, PluginVersion);
        this.server
            .getLogger()
            .silly(`PluginApiVersion with id §b${id}§r registered`);
    }

    /**
     * Register a new plugin and download the required dependencies
     */
    private async registerPlugin(id: string): Promise<PluginFile | null> {
        if (id === '.extracted') return null;

        let time = Date.now();
        let dir = path.join(process.cwd(), 'plugins', id);
        if (!fs.lstatSync(dir).isDirectory()) {
            // Invalid file
            if (!dir.includes('.jspz')) {
                return null;
            }

            if (
                !fs.existsSync(path.join(process.cwd(), '/plugins/.extracted/'))
            ) {
                fs.mkdirSync(path.join(process.cwd(), '/plugins/.extracted/'));
            }

            dir = path.join(process.cwd(), '/plugins/.extracted/', id);

            this.server
                .getLogger()
                .silly(`Extracting plugin with id §b${id}...`);
            await fs
                .createReadStream(path.join(process.cwd(), 'plugins/', id))
                .pipe(unzipper.Extract({ path: dir }))
                .promise();
        }

        // Asset or config folder
        if (!fs.existsSync(path.join(dir, 'package.json'))) {
            return null;
        }

        const pkg = require(path.join(dir, 'package.json'));
        if (!pkg) throw new Error(`package.json is invalid!`);

        if (!fs.existsSync(path.join(process.cwd(), '/plugins/', pkg.name))) {
            fs.mkdirSync(path.join(process.cwd(), '/plugins/', pkg.name));
        }

        if (pkg.dependencies)
            await Promise.all(
                Object.entries(pkg?.dependencies)?.map((dependency) => {
                    const moduleManager = new ModuleManager({
                        cwd: dir,
                        pluginsPath: path.join(dir, 'node_modules')
                    });
                    return moduleManager.installFromNpm(
                        dependency[0] as string,
                        dependency[1] as string
                    );
                })
            );

        if (!pkg?.prismarine?.apiVersion)
            throw new Error(`apiVersion is missing in package.json!`);

        const pluginApiVersion: any = this.getPluginApiVersion(
            pkg.prismarine.apiVersion
        );
        if (!pluginApiVersion)
            throw new Error(
                `Invalid PluginApiVersion ${pkg.prismarine.apiVersion}!`
            );

        const plugin = new PluginFile(
            this.server,
            dir,
            new pluginApiVersion(this.server, pkg)
        );

        try {
            await plugin.onEnable();
        } catch (err) {
            this.server
                .getLogger()
                .warn(
                    `Failed to enable §b${plugin.getName()}@${plugin.getVersion()}§r: ${err}!`
                );
            return null;
        }

        this.plugins.set(pkg.name, plugin);

        this.server
            .getLogger()
            .silly(
                `Plugin with id §b${plugin.getName()}@${plugin.getVersion()}§r registered`
            );
        this.server
            .getLogger()
            .info(
                `Plugin §b${plugin.getDisplayName()} ${plugin.getVersion()}§r loaded successfully (took ${
                    Date.now() - time
                } ms)!`
            );
        return plugin;
    }

    /**
     * Deregister a plugin
     */
    private async deregisterPlugin(id: string) {
        const plugin: PluginFile = this.plugins.get(id);
        try {
            await plugin.onDisable?.();
        } catch (err) {
            this.server
                .getLogger()
                .warn(
                    `Failed to disable §b${plugin.getName()}@${plugin.getVersion()}§r: ${err}!`
                );
        }

        this.plugins.delete(id);
    }

    /**
     * Get a specific pluginApiVersion.
     * NOTE: the minor version returned may be higher but NEVER lower.
     */
    private getPluginApiVersion(id: string): typeof PluginApiVersion {
        const version = this.pluginApiVersions.get(id);
        if (version) return version;

        // Try to use a higher minor version instead
        return this.pluginApiVersions.get(
            Array.from(this.pluginApiVersions.keys()).filter(
                (apiVersion: string) =>
                    apiVersion.split('.')[0] === id.split('.')[0] &&
                    apiVersion.split('.')[1] >= id.split('.')[1]
            )[0]
        );
    }

    /**
     * Return enabled plugins
     */
    public getPlugins() {
        return Array.from(this.plugins.values());
    }
}
