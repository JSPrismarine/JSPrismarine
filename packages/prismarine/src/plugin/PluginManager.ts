import { PluginManager as ModuleManager } from 'live-plugin-manager';
import PluginApiVersion from './api/PluginApiVersion';
import PluginFile from './PluginFile';
import Server from '../Server';
import Timer from '../utils/Timer';
import cwd from '../utils/cwd';
import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';

export default class PluginManager {
    private readonly server: Server;
    private readonly pluginApiVersions = new Map();
    private readonly plugins = new Map();

    public constructor(server: Server) {
        this.server = server;
    }

    /**
     * OnEnable hook
     */
    public async onEnable() {
        // Create plugin folder
        if (!fs.existsSync(cwd() + '/plugins')) {
            fs.mkdirSync(cwd() + '/plugins');
        }

        // Register PluginApiVersion(s)
        let timer = new Timer();

        const pluginApiVersions = fs.readdirSync(path.join(__dirname, 'api/versions'));
        await Promise.all(
            pluginApiVersions.map((id: string) => {
                try {
                    return this.registerPluginApiVersion(id);
                } catch (error) {
                    this.server
                        .getLogger()
                        .error(`§cFailed to load pluginApiVersion ${id}: ${error}`, 'PluginManager/onEnable');
                    this.server.getLogger().silly(error.stack, 'PluginManager/onEnable');
                    return null;
                }
            })
        );
        this.server
            .getLogger()
            .debug(
                `Registered §b${pluginApiVersions.length}§r pluginApiVersion(s) (took ${timer.stop()} ms)!`,
                'PluginManager/onEnable'
            );

        // Register Plugin(s)
        timer = new Timer();

        const plugins = fs.readdirSync(path.join(cwd(), 'plugins'));
        const res = (
            await Promise.all(
                plugins.map(async (id: string) => {
                    try {
                        return await this.registerPlugin(id);
                    } catch (error) {
                        this.server
                            .getLogger()
                            .error(`§cFailed to load plugin ${id}: ${error}`, 'PluginManager/onEnable');
                        this.server.getLogger().silly(error.stack, 'PluginManager/onEnable');
                    }
                })
            )
        ).filter((a) => a);
        this.server
            .getLogger()
            .debug(`Registered §b${res.length}§r plugin(s) (took ${timer.stop()} ms)!`, 'PluginManager/onEnable');
    }

    /**
     * OnDisable hook
     */
    public async onDisable() {
        await Promise.all(
            Array.from(this.plugins.keys()).map(async (id: string) => {
                return this.deregisterPlugin(id);
            })
        );
        this.pluginApiVersions.clear();
    }

    /**
     * Register a pluginApiVersion
     */
    private async registerPluginApiVersion(id: string) {
        try {
            const dir = path.join(__dirname, 'api/versions', id, 'PluginApi');
            const PluginVersion = require(dir).default;

            this.pluginApiVersions.set(id, PluginVersion);
            this.server
                .getLogger()
                .silly(`PluginApiVersion with id §b${id}§r registered`, 'PluginManager/registerPluginApiVersion');
        } catch (err) {
            this.server.getLogger().error(err, 'PluginManager/registerPluginApiVersion');
            throw new Error('invalid PluginApiVersion');
        }
    }

    /**
     * Register a new plugin and download the required dependencies
     */
    private async registerPlugin(id: string): Promise<PluginFile | null> {
        if (id === '.extracted') return null;

        const timer = new Timer();

        let dir = path.join(cwd(), 'plugins', id);
        if (!fs.lstatSync(dir).isDirectory()) {
            // Invalid file
            if (!dir.includes('.jspz')) {
                return null;
            }

            if (!fs.existsSync(path.join(cwd(), '/plugins/.extracted/'))) {
                fs.mkdirSync(path.join(cwd(), '/plugins/.extracted/'));
            }

            dir = path.join(cwd(), '/plugins/.extracted/', id);

            this.server.getLogger().silly(`Extracting plugin with id §b${id}...`, 'PluginManager/registerPlugin');
            await fs
                .createReadStream(path.join(cwd(), 'plugins/', id))
                .pipe(unzipper.Extract({ path: dir }))
                .promise();
        }

        // Asset or config folder
        if (!fs.existsSync(path.join(dir, 'package.json'))) {
            return null;
        }

        if (!dir.endsWith('.jspz'))
            this.server
                .getLogger()
                .warn(
                    `${id} isn't packaged as .jspz and should NOT be used on production servers!`,
                    `PluginManager/registerPlugin/${id}`
                );

        const pkg = require(path.join(dir, 'package.json'));
        if (!pkg) throw new Error(`package.json is missing!`);

        if (!pkg.name || !pkg.prismarine) throw new Error(`package.json is invalid!`);

        if (!fs.existsSync(path.join(cwd(), '/plugins/', pkg.name))) {
            fs.mkdirSync(path.join(cwd(), '/plugins/', pkg.name));
        }

        if (pkg.dependencies)
            await Promise.all(
                Object.entries(pkg.dependencies).map(async (dependency) => {
                    const moduleManager = new ModuleManager({
                        cwd: dir,
                        pluginsPath: path.join(dir, 'node_modules')
                    });

                    if (([] as any).includes(dependency[0])) {
                        this.server
                            .getLogger()
                            .warn(
                                `plugin §b${pkg.name} ${pkg.version}§r is trying to depend on §5${dependency[0]}§r which should be a dev-dependency!`,
                                'PluginManager/registerPlugin'
                            );
                        return;
                    }

                    try {
                        await moduleManager.installFromNpm(dependency[0], dependency[1] as string);
                    } catch (error) {
                        this.server
                            .getLogger()
                            .debug(`moduleManager failed with: ${error}`, 'PluginManager/registerPlugin');
                        this.server.getLogger().silly(error.stack, 'PluginManager/registerPlugin');
                        throw new Error(`Failed to install ${dependency[0]}: ${error}`);
                    }
                })
            );

        if (!pkg.prismarine?.apiVersion) throw new Error(`apiVersion is missing in package.json!`);

        const pluginApiVersion: any = this.getPluginApiVersion(pkg.prismarine.apiVersion);
        if (!pluginApiVersion) throw new Error(`Invalid PluginApiVersion ${pkg.prismarine.apiVersion}!`);

        const plugin = new PluginFile(this.server, dir, new pluginApiVersion(this.server, pkg));

        try {
            await plugin.onEnable();
        } catch (error) {
            this.server
                .getLogger()
                .warn(
                    `Failed to enable §b${plugin.getName()}@${plugin.getVersion()}§r: ${error}!`,
                    'PluginManager/registerPlugin'
                );
            this.server.getLogger().silly(error.stack, 'PluginManager/registerPlugin');
            return null;
        }

        this.plugins.set(pkg.name, plugin);

        this.server
            .getLogger()
            .silly(
                `Plugin with id §b${plugin.getName()}@${plugin.getVersion()}§r registered`,
                'PluginManager/registerPlugin'
            );
        this.server
            .getLogger()
            .info(
                `Plugin §b${plugin.getDisplayName()} ${plugin.getVersion()}§r loaded successfully (took ${timer.stop()} ms)!`,
                'PluginManager/registerPlugin'
            );
        return plugin;
    }

    public async registerClassPlugin(pkg: any, plugin: PluginFile): Promise<PluginFile | null> {
        const timer = new Timer();

        try {
            await plugin.onEnable();
        } catch (error) {
            this.server
                .getLogger()
                .warn(
                    `Failed to enable §b${plugin.getName()}@${plugin.getVersion()}§r: ${error}!`,
                    'PluginManager/registerPlugin'
                );
            return null;
        }

        this.plugins.set(pkg.name, plugin);

        this.server
            .getLogger()
            .silly(
                `Plugin with id §b${plugin.getName()}@${plugin.getVersion()}§r registered`,
                'PluginManager/registerPlugin'
            );
        this.server
            .getLogger()
            .info(
                `Plugin §b${plugin.getDisplayName()} ${plugin.getVersion()}§r loaded successfully (took ${timer.stop()} ms)!`,
                'PluginManager/registerPlugin'
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
        } catch (error) {
            this.server
                .getLogger()
                .warn(
                    `Failed to disable §b${plugin.getName()}@${plugin.getVersion()}§r: ${error}!`,
                    'PluginManager/deregisterPlugin'
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
            Array.from(this.pluginApiVersions.keys()).find(
                (apiVersion: string) =>
                    apiVersion.split('.')[0] === id.split('.')[0] && apiVersion.split('.')[1] >= id.split('.')[1]
            )
        );
    }

    /**
     * Return enabled plugins
     */
    public getPlugins() {
        return Array.from(this.plugins.values());
    }
}
