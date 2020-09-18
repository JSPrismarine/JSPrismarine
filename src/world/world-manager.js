const logger = require('../utils/logger')
const Experimental = require('./experimental/experimental')
const World = require('./world')

'use strict'

class WorldManager {

    /** @type {Map<String, World>} */
    #worlds = new Map()
    /** @type {World} */
    #defaultWorld = null

    /**
     * Loads a world by its folder name.
     * 
     * @param {string} folderName - folder name of the world
     * @param {boolean} def - is default level
     */
    loadWorld(folderName) {
        if (this.isWorldLoaded(folderName)) {
            return logger.warn(`World §e${folderName}§r has already been loaded!`)
        }
        let levelPath = __dirname + `/../../worlds/${folderName}/`
        // TODO: figure out provider by data
        let world = new World(folderName, new Experimental(levelPath))
        this.#worlds.set(world.uniqueId, world)

        // First level to be loaded is also the default one
        if (!this.#defaultWorld) {
            this.#defaultWorld = this.#worlds.get(world.uniqueId)
        }

        logger.debug(`Successfully loaded world §e${folderName}§r`)
    }

    /**
     * Unloads a level by its folder name.
     * 
     * @param {string} folderName - folder name of the world
     */
    unloadWorld(folderName) {
        if (!this.isWorldLoaded(folderName)) {
            return logger.error(
                `Cannot unload a not loaded world with name §e${folderName}§r`
            )
        }

        let world = this.getWorldByName(folderName)
        if (this.#defaultWorld == world) {
            return logger.warn(`Cannot unload the §edefault§r level!`)
        }

        world.close()
        this.#worlds.delete(world.uniqueId)
        logger.debug(`Successfully unloaded world §e${folderName}§r`)
    }  

    /**
     * Returns whatever the world is loaded or not.
     * 
     * @param {string} folderName 
     * @returns {boolean} 
     */
    isWorldLoaded(folderName) {
        for (let world of this.#worlds.values()) {
            if (world.name.toLowerCase() == 
                folderName.toLowerCase()) {
                return true
            }
        }
        return false
    }

    /**
     * Returns a world by its folder name.
     * 
     * @param {string} folderName 
     */
    getWorldByName(folderName) {
        for (let world of this.#worlds.values()) {
            if (world.name.toLowerCase() == 
                folderName.toLowerCase()) {
                return world
            }
        }
    } 

    /**
     * Returns the server default world.
     * 
     * @returns {World}
     */
    getDefaultWorld() {
        return this.#defaultWorld
    }

    /**
     * Returns an iterator for all worlds.
     * 
     * @returns {IterableIterator<World>}
     */
    getWorlds() {
        return this.#worlds.values() 
    }

}
module.exports = WorldManager