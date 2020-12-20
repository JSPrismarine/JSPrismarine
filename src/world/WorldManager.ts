import GeneratorManager from './GeneratorManager';
import LevelDB from './leveldb/Leveldb';
import Prismarine from '../Prismarine';
import World from './World';
import fs from 'fs';

export default class WorldManager {
    private worlds: Map<string, World> = new Map();
    private defaultWorld: World | null = null;
    private genManager: GeneratorManager;
    private server: Prismarine;

    public constructor(server: Prismarine) {
        this.server = server;
        this.genManager = new GeneratorManager(server);

        // Create folders
        if (!fs.existsSync(process.cwd() + '/worlds')) {
            fs.mkdirSync(process.cwd() + '/worlds');
        }
    }

    public async onEnable(): Promise<void> {
        const defaultWorld = this.server.getConfig().getLevelName();
        if (!defaultWorld)
            return this.server.getLogger().warn(`Invalid world!`);

        const world = await this.loadWorld(
            this.server.getConfig().getWorlds()[defaultWorld],
            defaultWorld
        );
        await world.onEnable();
    }

    public async onDisable(): Promise<void> {
        await Promise.all(
            this.getWorlds().map(
                async (world) => await this.unloadWorld(world.getName())
            )
        );
    }

    /**
     * Loads a world by its folder name.
     */
    public loadWorld(worldData: any, folderName: string): Promise<World> {
        return new Promise((resolve, reject) => {
            if (this.isWorldLoaded(folderName)) {
                this.server
                    .getLogger()
                    .warn(`World §e${folderName}§r has already been loaded!`);
                reject();
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
                this.defaultWorld =
                    this.worlds.get(world.getUniqueId()) || null;
                this.server
                    .getLogger()
                    .info(`Loaded §b${folderName}§r as default world!`);
            }
            this.server
                .getLogger()
                .debug(`World §b${folderName}§r successfully loaded!`);
            resolve(world);
        });
    }

    /**
     * Unloads a level by its folder name.
     */
    public async unloadWorld(folderName: string): Promise<void> {
        if (!this.isWorldLoaded(folderName)) {
            return this.server
                .getLogger()
                .error(
                    `Cannot unload a not loaded world with name §b${folderName}`
                );
        }

        let world = this.getWorldByName(folderName);
        if (!world) {
            return this.server
                .getLogger()
                .error(`Cannot unload world ${folderName}`);
        }

        world.close();
        this.worlds.delete(world.getUniqueId());
        this.server
            .getLogger()
            .debug(`Successfully unloaded world §b${folderName}§f!`);
    }

    /**
     * Returns whatever the world is loaded or not.
     */
    public isWorldLoaded(folderName: string): boolean {
        for (let world of this.worlds.values()) {
            if (world.getName().toLowerCase() == folderName.toLowerCase()) {
                return true;
            } else if (world.getUniqueId() === folderName) {
                return true;
            }
        }
        return false;
    }

    /**
     * Returns a world by its folder name.
     */
    public getWorldByName(folderName: string): World | null {
        return (
            this.getWorlds().find(
                (world) =>
                    world.getName().toLowerCase() === folderName.toLowerCase()
            ) ?? null
        );
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
