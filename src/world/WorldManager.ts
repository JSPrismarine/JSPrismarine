import type Prismarine from "../Prismarine";
import GeneratorManager from "./GeneratorManager";
import World from "./World";

import logger from '../utils/Logger';
import LevelDB from './leveldb/leveldb';

class WorldManager {
    private worlds: Map<string, World> = new Map();
    private defaultWorld: World | null = null;
    private genManager: GeneratorManager;
    private server: Prismarine;

    constructor(server: Prismarine) {
        this.server = server;
        this.genManager = new GeneratorManager(server);
    }

    /**
     * Loads a world by its folder name.
     * 
     * @param worldData - World properties data
     * @param folderName - World folder name
     */
    public loadWorld(worldData: any, folderName: string): World {
        if (this.isWorldLoaded(folderName)) {
            return this.server.getLogger().warn(`World §e${folderName}§r has already been loaded!`);
        }
        let levelPath = process.cwd() + `/worlds/${folderName}/`;
        // TODO: figure out provider by data
        let world = new World({
            name: folderName,
            server: this.server,
            provider: new LevelDB(levelPath, this.server),

            seed: worldData.seed,
            generator: worldData.generator
        });
        this.worlds.set(world.getUniqueId(), world);

        // First level to be loaded is also the default one
        if (!this.defaultWorld) {
            this.defaultWorld = this.worlds.get(world.getUniqueId()) || null;
            this.server.getLogger().info(`Loaded §b${folderName}§r as default world!`);
        }
        this.server.getLogger().debug(`World §b${folderName}§r succesfully loaded!`);
        return world;
    }

    /**
     * Unloads a level by its folder name.
     * 
     * @param folderName - World folder name
     */
    public unloadWorld(folderName: string): void {
        if (!this.isWorldLoaded(folderName)) {
            return this.server.getLogger().error(
                `Cannot unload a not loaded world with name §b${folderName}`
            );
        }

        let world = this.getWorldByName(folderName);
        if (!world) return this.server.getLogger().error(`Cannot load world ${folderName}`);
        if (this.defaultWorld == world) {
            return this.server.getLogger().warn(`Cannot unload the default level!`);
        }

        world.close();
        this.worlds.delete(world.getUniqueId());
        this.server.getLogger().debug(`Successfully unloaded world §b${folderName}§f!`);
    }  

    /**
     * Returns whatever the world is loaded or not.
     * 
     * @param {string} folderName 
     * @returns {boolean} 
     */
    public isWorldLoaded(folderName: string): boolean {
        for (let world of this.worlds.values()) {
            if (world.getName().toLowerCase() == 
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
    public getWorldByName(folderName: string): World | null {
        for (let world of this.worlds.values()) {
            if (world.getName().toLowerCase() == 
                folderName.toLowerCase()) {
                return world;
            }
        }
        return null;
    } 

    /**
     * Returns an array with all worlds.
     */
    public getWorlds(): World[] {
        return Array.from(this.worlds.values()); 
    }

    public getDefaultWorld(): World | null {
        return this.defaultWorld;
    } 

    public getGeneratorManager(): GeneratorManager {
        return this.genManager;
    }
}
export default WorldManager;