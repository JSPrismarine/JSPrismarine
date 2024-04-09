import Filesystem from './providers/filesystem/Filesystem';
import GeneratorManager from './GeneratorManager';
import type Provider from './providers/Provider';
import type Server from '../Server';
import World from './World';
import { cwd } from '../utils/cwd';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Standard world data.
 */
export interface WorldData {
    seed: number;
    provider: string;
    generator: string;
}

/**
 * The world manager is responsible level loading, unloading, and general level management.
 */
export default class WorldManager {
    private readonly worlds: Map<string, World> = new Map() as Map<string, World>;
    private defaultWorld: World | undefined;
    private readonly genManager: GeneratorManager;
    private readonly server: Server;
    private providers: Map<string, any> = new Map() as Map<string, any>; // TODO: this should be a manager

    public constructor(server: Server) {
        this.server = server;
        this.genManager = new GeneratorManager(server);

        // Create folders
        if (!fs.existsSync(path.join(cwd(), '/worlds'))) {
            fs.mkdirSync(path.join(cwd(), '/worlds'));
        }
    }

    /**
     * Enable the manager and load all worlds.
     */
    public async onEnable(): Promise<void> {
        this.addProvider('Filesystem', Filesystem);

        const defaultWorld = this.server.getConfig().getLevelName();
        if (!defaultWorld) {
            this.server.getLogger().warn(`Invalid world!`);
            return;
        }

        const worldData = this.server.getConfig().getWorlds()[defaultWorld];
        if (!worldData) throw new Error(`Invalid level-name`);

        void (await this.loadWorld(worldData, defaultWorld));
    }

    /**
     * Signifies that the manager is being disabled and all worlds should be unloaded.
     */
    public async onDisable(): Promise<void> {
        await Promise.all(this.getWorlds().map(async (world) => this.unloadWorld(world.getName())));
        this.providers.clear();
    }

    /**
     * Add a provider to the internal providers map.
     *
     * @param name - the name of the provider CASE SENSITIVE
     * @param provider - the provider
     */
    public addProvider(name: string, provider: any) {
        this.providers.set(name, provider);
    }

    /**
     * Remove a provider from the internal providers map.
     *
     * @param name - the name of the provider CASE SENSITIVE
     */
    public removeProvider(name: string) {
        this.providers.delete(name);
    }

    /**
     * Get all providers.
     */
    public getProviders(): Map<string, Provider> {
        return this.providers as Map<string, Provider>;
    }

    /**
     * Save the world to disk.
     */
    public async save(): Promise<void> {
        this.server.getLogger().info('Saving worlds');
        for (const world of this.getWorlds()) {
            await world.save();
        }
    }

    /**
     * Load a world
     *
     * @param worldData - the world data including provider key, generator
     * @param folderName - the name of the folder containing the world
     */
    public async loadWorld(worldData: WorldData, folderName: string): Promise<World> {
        return new Promise(async (resolve, reject) => {
            if (!(worldData as any)) throw new Error('Invalid world data');

            if (this.isWorldLoaded(folderName)) {
                this.server.getLogger().warn(`World §e${folderName}§r has already been loaded!`);
                reject();
                return;
            }

            const levelPath = path.join(cwd(), `/worlds/${folderName}/`);
            const provider = this.providers.get(worldData.provider ?? 'Filesystem');
            const generator = this.server
                .getWorldManager()
                .getGeneratorManager()
                .getGenerator(worldData.generator ?? 'Flat');

            if (!provider) {
                reject(new Error(`invalid provider with id ${worldData.provider}`));
                return;
            }

            // TODO: figure out provider by data
            const world = new World({
                name: folderName,
                path: levelPath,
                server: this.server,
                provider: new provider(levelPath, this.server),

                seed: worldData.seed,
                generator,
                config: worldData
            });
            this.worlds.set(world.getUniqueId(), world);

            // First level to be loaded is also the default one
            if (!this.defaultWorld) {
                this.defaultWorld = this.worlds.get(world.getUniqueId())!;
                this.server.getLogger().info(`Loaded §b${folderName}§r as default world!`);
            }

            this.server.getLogger().verbose(`World §b${folderName}§r successfully loaded!`);

            await world.onEnable();
            resolve(world);
        });
    }

    /**
     * Unloads a level by its folder name.
     */
    public async unloadWorld(folderName: string): Promise<void> {
        if (!this.isWorldLoaded(folderName)) {
            this.server.getLogger().error(`Cannot unload a not loaded world with name §b${folderName}`);
            return;
        }

        const world = this.getWorldByName(folderName);
        if (!world) {
            this.server.getLogger().error(`Cannot unload world ${folderName}`);
            return;
        }

        await world.onDisable();
        this.worlds.delete(world.getUniqueId());
        this.server.getLogger().verbose(`Successfully unloaded world §b${folderName}§f!`);
    }

    /**
     * Returns whatever the world is loaded or not.
     */
    public isWorldLoaded(folderName: string): boolean {
        for (const world of this.worlds.values()) {
            if (world.getName().toLowerCase() === folderName.toLowerCase()) {
                return true;
            }

            if (world.getUniqueId() === folderName) {
                return true;
            }
        }

        return false;
    }

    /**
     * Returns a world by its folder name.
     */
    public getWorldByName(folderName: string): World | null {
        return this.getWorlds().find((world) => world.getName().toLowerCase() === folderName.toLowerCase()) ?? null;
    }

    /**
     * Returns an array with all worlds.
     */
    public getWorlds(): World[] {
        return Array.from(this.worlds.values());
    }

    public getDefaultWorld() {
        return this.defaultWorld;
    }

    public getGeneratorManager(): GeneratorManager {
        return this.genManager;
    }
}
