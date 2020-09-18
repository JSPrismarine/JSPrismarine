const Prismarine = require('../prismarine')
const Plugin = require('./plugin')
const fs = require('fs')
const path = require('path')
const PluginManifest = require('./plugin-manifest')
const EventManager = require('../events/event-manager')
const logger = require('../utils/logger')

'use strict'

/**
 * @author Armagan
 */
class PluginManager {

    /** @type {Prismarine} */
    #server
    /** @type {Map<String, Plugin>} */
    #plugins = new Map()

    constructor(server) {
        this.#server = server
    }

    /**
     * Loads a plugin by the given path.
     * 
     * @param {String} pluginFolder - path to plugin folder
     * @returns {boolean}
     */
    loadPlugin(pluginFolder) {
        let manifestFilePath = path.join(pluginFolder, 'manifest.json')
        if (!fs.existsSync(manifestFilePath)) {
            throw `plugin manifest file not found!`
        }

        // Try parsing the manifest
        let pluginManifest = new PluginManifest()
        try {
            pluginManifest = JSON.parse(fs.readFileSync(manifestFilePath, 'utf8'))
        } catch {
            throw 'invalid manifest.json file. (JSON Parse Error)'
        }

        // Check manifest data
        // TODO: server API, author(s)?
        if (typeof pluginManifest.name !== 'string') {
            throw 'invalid plugin name, string expected'
        }

        if (typeof pluginManifest.indexFile !== 'string') {
            throw 'invalid plugin index file, string expected'
        }

        let indexFilePath = path.join(pluginFolder, pluginManifest.indexFile)
        if (!fs.existsSync(indexFilePath)) {
            throw `Index file not found: ${pluginManifest.indexFile}`
        }

        // Import main plugin class
        let pluginMain = require(indexFilePath)

        // Re-construct plugin
        let plugin = new Plugin()
        plugin.main = pluginMain
        plugin.path = pluginFolder
        plugin.manifest = pluginManifest

        // Save the plugin into memory
        if (this.#plugins.has(pluginManifest.name)) {
            logger.info(`Duplicated plugin: ${pluginManifest.name}`)
            return false
        }

        this.#plugins.set(pluginManifest.name, plugin)
        plugin.main(this.#server, EventManager)
        logger.info(`Plugin §b${plugin.manifest.name}§r loaded successfully!`)
        return true
    }

    /**
     * TODO: fully unload it, and test
     * 
     * @param {String} pluginName 
     */
    unloadPlugin(pluginName) {
        if (!(this.#plugins.has(pluginName))) {
            return logger.error(
                `Cannot unload plugin ${pluginName}, plugin not found!`
            )
        }
        this.#plugins.delete(pluginName)
        let name = require.resolve(`${pluginName}.js`)
        delete require.cache[name]
    }

    /**
     * Returns an instance of a loaded plugin.
     * 
     * CASE SENSITIVE.
     * 
     * @param {String} pluginName 
     * @returns {null|PluginType}
     */
    getPlugin(pluginName) {
        return this.#plugins.get(pluginName) || null
    }

    getPlugins() {
        return this.#plugins.values()
    }

    getServer() {
        return this.#server
    }

}

module.exports = PluginManager