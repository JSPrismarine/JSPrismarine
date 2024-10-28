import type { Server, Service } from '../';
import { withCwd } from '../utils/cwd';
import { GeneratorManager } from './';
import { World } from './World';
import type Provider from './providers/Provider';

import Anvil from './providers/anvil/Anvil';
import Filesystem from './providers/filesystem/Filesystem';

import fs from 'node:fs';

/**
 * Standard world data.
 */
export interface WorldData {
    seed: number;
    provider?: string;
    generator?: string;
}

const WORLDS_FOLDER = 'worlds';
const DEFAULT_WORLD_PROVIDER = 'Filesystem';

/**
 * The world manager is responsible level loading, unloading, and general level management.
 */
export default class WorldManager implements Service {
    private readonly worlds: Map<string, World> = new Map() as Map<string, World>;
    private defaultWorld: World | undefined;
    private readonly genManager: GeneratorManager;
    private readonly server: Server;
    private providers: Map<string, any> = new Map() as Map<string, any>; // TODO: this should be a manager

    public constructor(server: Server) {
        this.server = server;
        this.genManager = new GeneratorManager(server);

        // Create the worlds directory if it doesn't exist.
        if (!fs.existsSync(withCwd(WORLDS_FOLDER))) {
            fs.mkdirSync(withCwd(WORLDS_FOLDER), { recursive: true });
        }
    }

    /**
     * On enable hook, enables the manager and load all worlds.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        this.addProvider('Anvil', Anvil);
        this.addProvider('Filesystem', Filesystem);

        const defaultWorld = this.server.getConfig().getLevelName();
        if (!defaultWorld) {
            this.server.getLogger().warn(`Invalid world!`);
            return;
        }

        const worldData = this.server.getConfig().getWorlds()[defaultWorld];
        if (!worldData) throw new Error(`Invalid level-name`);

        await this.loadWorld(worldData, defaultWorld);
    }

    /**
     * On disable hook.
     *
     * Signifies that the manager is being disabled and all worlds should be unloaded.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
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
        if (!(worldData as any)) throw new Error('Invalid world data');

        if (this.isWorldLoaded(folderName)) {
            throw new Error(`World ${folderName} has already been loaded`);
        }

        const levelPath = withCwd(WORLDS_FOLDER, folderName);
        const provider = this.providers.get(worldData.provider ?? DEFAULT_WORLD_PROVIDER);
        const generator = this.getGeneratorManager().getGenerator(worldData.generator ?? 'Flat');

        if (!provider) {
            throw new Error(`invalid provider with id ${worldData.provider}`);
        }

        const world = new World({
            name: folderName,
            path: levelPath,
            server: this.server,
            provider: new provider(levelPath, this.server),

            seed: worldData.seed,
            generator,
            config: worldData
        });
        this.worlds.set(world.getUUID(), world);

        // First level to be loaded is also the default one
        if (!this.defaultWorld) {
            this.defaultWorld = this.worlds.get(world.getUUID())!;
            this.server.getLogger().info(`Loaded ${world.getFormattedName()} as default world!`);
        }

        this.server.getLogger().verbose(`World ${world.getFormattedName()} successfully loaded!`);

        await world.enable();
        return world;
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

        await world.disable();
        this.worlds.delete(world.getUUID());
        this.server.getLogger().verbose(`Successfully unloaded world ${world.getFormattedName()}!`);
    }

    /**
     * Returns whatever the world is loaded or not.
     * @returns {boolean} true if the world is loaded, false otherwise
     */
    public isWorldLoaded(folderName: string): boolean {
        const world = Array.from(this.worlds.values()).find(
            (world) => world.getName().toLowerCase() === folderName.toLowerCase()
        );

        if (world) return true;
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
        return this.defaultWorld ?? this.getWorlds()[0];
    }

    public getGeneratorManager(): GeneratorManager {
        return this.genManager;
    }
}
