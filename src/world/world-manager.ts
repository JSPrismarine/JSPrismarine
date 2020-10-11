import Prismarine from "../prismarine";
import GeneratorManager from "./generator-manager";
import World from "./world";

const logger = require('../utils/logger');
const LevelDB = require('./leveldb/leveldb');

export default class WorldManager {

    /** @type {Map<String, World>} */
    #worlds = new Map()
    /** @type {World} */
    #defaultWorld: World | null  = null
    /** @type {Prismarine} */
    #server: Prismarine
    /** @type {GeneratorManager} */
    #generator: GeneratorManager

    constructor(server: Prismarine) {
        this.#server = server;
        this.#generator = new GeneratorManager();
    }

    /**
     * Loads a world by its folder name.
     * 
     * @param {object} worldData - world data
     * @param {string} folderName - folder name of the world
     */
    loadWorld(worldData: any, folderName: string) {
        if (this.isWorldLoaded(folderName)) {
            return logger.warn(`World §e${folderName}§r has already been loaded!`);
        }
        let levelPath = process.cwd() + `/worlds/${folderName}/`;
        // TODO: figure out provider by data
        let world = new World({
            name: folderName,
            server: this.#server,
            provider: new LevelDB(levelPath),

            seed: worldData.seed,
            generator: worldData.generator
        });
        this.#worlds.set(world.uniqueId, world);

        // First level to be loaded is also the default one
        if (!this.#defaultWorld) {
            this.#defaultWorld = this.#worlds.get(world.uniqueId);
            logger.info(`Loaded §b${folderName}§r as default world!`);
        }
        logger.debug(`World §b${folderName}§r succesfully loaded!`);
        return world;
    }

    /**
     * Unloads a level by its folder name.
     * 
     * @param {string} folderName - folder name of the world
     */
    unloadWorld(folderName: string) {
        if (!this.isWorldLoaded(folderName)) {
            return logger.error(
                `Cannot unload a not loaded world with name §b${folderName}`
            );
        }

        let world = this.getWorldByName(folderName);
        if (this.#defaultWorld == world) {
            return logger.warn(`Cannot unload the default level!`);
        }

        world.close();
        this.#worlds.delete(world.uniqueId);
        logger.debug(`Successfully unloaded world §b${folderName}§f!`);
        return null;
    }  

    /**
     * Returns whatever the world is loaded or not.
     * 
     * @param {string} folderName 
     * @returns {boolean} 
     */
    isWorldLoaded(folderName: string) {
        for (let world of this.#worlds.values()) {
            if (world.name.toLowerCase() == 
                folderName.toLowerCase()) {
                return true;
            }
        }
        return false;
    }

    /**
     * Returns a world by its folder name.
     * 
     * @param {string} folderName 
     * @returns {World}
     */
    getWorldByName(folderName: string) {
        for (let world of this.#worlds.values()) {
            if (world.name.toLowerCase() == 
                folderName.toLowerCase()) {
                return world;
            }
        }
        return null;
    } 

    /**
     * Returns the server default world.
     * 
     * @returns {World}
     */
    getDefaultWorld() {
        return this.#defaultWorld;
    }

    /**
     * Returns an iterator for all worlds.
     * 
     * @returns {IterableIterator<World>}
     */
    getWorlds() {
        return this.#worlds.values(); 
    }

    getGeneratorManager() {
        return this.#generator;
    }

}
