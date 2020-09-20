const Prismarine = require("../prismarine")
const Plugin = require("./plugin")
const EventManager = require("../events/event-manager")

class PluginAPI {

    /** @type {Prismarine} */
    #server

    /** @type {Plugin} */
    #plugin

    /**
     * @param {Prismarine} server 
     * @param {Plugin} plugin 
     */
    constructor(server, plugin) {
        this.#server = server
        this.#plugin = plugin
    }

    getServer() {
        return this.#server
    }

    getPlugin() {
        return this.#plugin
    }

    getCommandManager() {
        return this.#server.getCommandManager()
    }

    getEventManager() {
        return EventManager
    }

    getPluginManager() {
        return this.#server.getPluginManager()
    }

    getLogger() {
        return this.#server.getLogger()
    }

    getWorldManager() {
        return this.#server.getWorldManager()
    }

    getRaknet() {
        return this.#server.getRaknet()
    }

    getPacketRegistry() {
        return this.#server.getPacketRegistry()
    }

    getPlayers() {
        return Array.from(this.#server.getPlayers().values())
    }

    getPlayerByName(name) {
        return this.#server.getPlayerByName(name)
    }

    getPlayerByExactName(name) {
        return this.#server.getPlayerByExactName(name)
    }

    getPlayerById(id) {
        return this.#server.getPlayerById(id)
    }
}

module.exports = PluginAPI