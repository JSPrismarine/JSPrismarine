import type { Server, Service } from '../';
import { withCwd } from '../utils/cwd';
import { GeneratorManager } from './GeneratorManager';
import { World } from './World';
import type Provider from './providers/Provider';

import Anvil from './providers/anvil/Anvil';
import LevelDB from './providers/leveldb/LevelDB';

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
/**
 * What a world with no `provider` in the config gets, and now the only one worth having: the
 * format the game itself uses, so a world this server creates can be opened in Minecraft and one
 * made there can be opened here.
 *
 * The `Filesystem` provider that used to sit beside it is gone. It wrote chunks as the network
 * payload, one file each, which is not a format anything else reads - and it never wrote the
 * block entities, entities or level metadata that the rest of the server had come to depend on,
 * so worlds saved through it came back missing what made them worlds. A config still naming it
 * is refused loudly rather than quietly downgraded, because the two store their chunks in
 * different places and pretending otherwise would read as data loss.
 */
const DEFAULT_WORLD_PROVIDER = 'LevelDB';

/**
 * The world manager is responsible level loading, unloading, and general level management.
 */
export default class WorldManager implements Service {
    private readonly worlds: Map<string, World> = new Map() as Map<string, World>;
    private defaultWorld!: World;
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
        this.addProvider('LevelDB', LevelDB);

        const defaultWorld = this.server.getConfig().getLevelName();
        // Throwing rather than warning-and-returning: `getDefaultWorld()` promises a world to
        // everyone downstream, and returning here would leave that promise unkept while the
        // type said otherwise.
        if (!defaultWorld) throw new Error(`Invalid level-name`);

        const worldData = this.server.getConfig().getWorlds()[defaultWorld];
        if (!worldData) throw new Error(`Invalid level-name`);

        this.defaultWorld = await this.loadWorld(worldData, defaultWorld);
        this.server.getLogger().info(`Loading ${this.defaultWorld.getFormattedName()} as default world!`);
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
            // Named, and with the alternatives listed. The `Filesystem` provider was removed, so
            // this is the first thing an existing config carrying it will hit, and "invalid
            // provider" on its own left nowhere to go from there.
            throw new Error(
                `Unknown world provider '${worldData.provider}' for world '${folderName}'. ` +
                    `Available providers: ${[...this.providers.keys()].join(', ')}.`
            );
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

        // Given somewhere to report its changes before it starts running. Attached from here
        // rather than built by the world, which must not have to know the network layer
        // exists in order to announce that a block changed.
        world.attachChangeSink(this.server.getWorldReplicators().for(world));

        await world.enable();
        this.server.getLogger().verbose(`World ${world.getFormattedName()} successfully loaded!`);

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

    /**
     * Returns the default world.
     * @returns {World} the world instance.
     */
    public getDefaultWorld(): World {
        return this.defaultWorld;
    }

    public getGeneratorManager(): GeneratorManager {
        return this.genManager;
    }
}
