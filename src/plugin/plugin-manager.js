const Prismarine = require("../prismarine");
const PluginType = require("./types/plugin-type");
const fs = require("fs");
const path = require("path");
const PluginManifestType = require("./types/plugin-manifest-type");


//TODO: a better way to import events
class PluginManager {

    /**
     * @type {Prismarine}
     */
    #server

    /** @type {Map<String, PluginType>} */
    #plugins = new Map()

    /**
     * @param {Prismarine} server 
     */
    constructor (server) {
        this.#server = server
    }

    getServer() {
        return this.#server
    }

    /**
     * @param {PluginType} plugin 
     */
    loadPlugin(plugin) {

        if (this.#plugins.has(plugin.manifest.name)) {

            this.#server.logger.info(`Duplicate plugin: ${plugin.manifest.name}`);

            return false;
        }

        this.#plugins.set(plugin.manifest.name,plugin);

        plugin.main(this.#server);

        this.#server.logger.info(`Successfully loaded §e${plugin.manifest.name}§r named plugin.`);

        return true;
    }

    /**
     * @param {String} pluginFolder 
     */
    loadPluginFolder(pluginFolder) {
        let manifestFilePath = path.join(pluginFolder,"manifest.json")

        if (!fs.existsSync(manifestFilePath)) {
            throw "Plugin manifest file not found!"
        }

        /** @type {PluginManifestType} */
        let pluginManifest = {}

        try {
            pluginManifest = JSON.parse(fs.readFileSync(manifestFilePath,"utf8"))
        } catch (err) {
            throw "Invalid manifest.json file. (JSON Parse Error)"
        }

        if (typeof pluginManifest.name != "string") {
            throw "Invalid plugin name. Should be type string."
        }

        if (typeof pluginManifest.indexFile != "string") {
            throw "Invalid plugin indexFile. Should be type string."
        }

        let pluginIndexFilePath = path.join(pluginFolder, pluginManifest.indexFile);

        if (!fs.existsSync(pluginIndexFilePath)) {
            throw `Index file not found. (${pluginManifest.indexFile})`
        }

        let pluginMain = require(pluginIndexFilePath)

        /** @type {PluginType} */
        let plugin = {}

        plugin.main = pluginMain
        plugin.path = pluginFolder
        plugin.manifest = pluginManifest

        this.loadPlugin(plugin)
    }

    /**
     * TODO: look later xd 
     * 
     * currently does nothing
     * 
     * @param {String} pluginName 
     */
    unloadPlugin(pluginName) {
        
    }

    /**
     * CASE SENSITIVE
     * @param {String} pluginName 
     * 
     * @returns {null|PluginType}
     */
    getPlugin(pluginName) {
        return this.#plugins.get(pluginName) || null;
    }

    getPlugins() {
        return this.#plugins.values()
    }

}

module.exports = PluginManager