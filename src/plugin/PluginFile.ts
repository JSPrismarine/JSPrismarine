import path from 'path';

export default class PluginFile {
    private path: string;
    private package;
    private plugin;

    constructor(dir: string) {
        this.path = dir;
        this.package = require(path.join(dir, 'package.json'))

        const plugin = require(path.join(dir, this.package.main)).default;
        this.plugin = new plugin();
        this.plugin.onInit();
    }
};
