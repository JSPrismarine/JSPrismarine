const path = require('path');

const Prismarine = require('../prismarine');
const PluginType = require('./plugin');
const Config = require('../utils/config');
const EventManager = require('../events/event-manager');


class PluginAPI {

    /** @type {Prismarine} */
    #server
    /** @type {PluginType} */
    #plugin
    /** @type {Map<String, Config>} */
    #configs = new Map()

    /**
     * @param {Prismarine} server 
     * @param {PluginType} plugin 
     */
    constructor(server, plugin) {
        this.#server = server;
        this.#plugin = plugin;
    }

    /**
     * Returns a config instance, if doesn't exists it creates 
     * a empty one and returns it.
     * Supported file extensions are (json, yaml, toml).
     * 
     * @param {string} fileName - filename with extension
     */
    getConfig(fileName) {
        if (!this.#configs.has(fileName)) {
            this.#configs.set(fileName, new Config(path.join(this.#plugin.path, fileName)));
        }

        return this.#configs.get(fileName);
    }

    getServer() {
        return this.#server;
    }

    getPlugin() {
        return this.#plugin;
    }

    getCommandManager() {
        return this.#server.getCommandManager();
    }

    getEventManager() {
        return EventManager;
    }

    getPluginManager() {
        return this.#server.getPluginManager();
    }

    getLogger() {
        return this.#server.getLogger();
    }

    getWorldManager() {
        return this.#server.getWorldManager();
    }

    getRaknet() {
        return this.#server.getRaknet();
    }

    getPacketRegistry() {
        return this.#server.getPacketRegistry();
    }

    getOnlinePlayers() {
        return Array.from(this.#server.getOnlinePlayers().values());
    }

    getPlayerByName(name) {
        return this.#server.getPlayerByName(name);
    }

    getPlayerByExactName(name) {
        return this.#server.getPlayerByExactName(name);
    }

    getPlayerById(id) {
        return this.#server.getPlayerById(id);
    }
}

module.exports = PluginAPI;
