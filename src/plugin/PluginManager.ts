import fs from "fs";
import path from "path";
import { PluginManager as ModuleManager } from 'live-plugin-manager';
import Prismarine from "../prismarine";
import PluginFile from "./PluginFile";

export default class PluginManager {
    private server: Prismarine;
    private plugins = new Map();

    constructor(server: Prismarine) {
        this.server = server;

        // Register plugins
        const plugins = fs.readdirSync(path.join(process.cwd(), 'plugins'));
        plugins.forEach(async (id: string) => {
            await this.registerPlugin(id);
        });
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

        this.plugins.set(pkg.name, new PluginFile(dir));
        this.server.getLogger().silly(`Plugin with id §b${pkg.name}@${pkg.version}§r registered`);
        // this.plugins.get(pkg.name)
    }
    private async deregisterPlugin(id: string) { }
}
