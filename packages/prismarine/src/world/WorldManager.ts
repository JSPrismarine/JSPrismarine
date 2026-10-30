import type { Server, Service } from '../';
import { withCwd } from '../utils/cwd';
import { worldSeedOf } from '../utils/Seed';
import { GeneratorFactories } from './GeneratorFactories';
import { Dimensions } from './Dimension';
import { requireJavaWorldgenRegistries } from './generators/datadriven/javaWorldgenData';
import type { JavaWorldgenRegistries } from './generators/datadriven/javaWorldgenData';
import { normalizeWorldData } from '../config/normalizeWorldData';
import { overworldStemOf } from './overworldStem';
import { contentRandomTickHandlers } from './randomTicks';
import { contentBlockTickHandlers } from './blockTicks';
import { contentRedstoneUpdateHandlers } from './redstoneUpdates';
import { World } from './World';
import type BaseProvider from './providers/BaseProvider';

import Anvil from './providers/anvil/Anvil';
import LevelDB from './providers/leveldb/LevelDB';

import fs from 'node:fs';
import type { WorldData } from '../config/JsonConfigTypes';

export type { WorldData } from '../config/JsonConfigTypes';

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
 * A world provider class the manager instantiates per world with the world folder and server.
 */
export type ProviderClass = new (folderPath: string, server: Server) => BaseProvider;

/**
 * The world manager is responsible level loading, unloading, and general level management.
 */
export default class WorldManager implements Service {
    private readonly worlds: Map<string, World> = new Map();
    private readonly worldsByDimension = new Map<string, Set<World>>();
    private defaultWorld!: World;
    private readonly generatorFactories = new GeneratorFactories();

    /** Java's worldgen registries, read once for every world that needs them. */
    private worldgenRegistries: JavaWorldgenRegistries | undefined;
    private readonly server: Server;
    private providers = new Map<string, ProviderClass>(); // TODO: this should be a manager

    public constructor(server: Server) {
        this.server = server;
        server.getLogger().verbose(`Registered §b${this.generatorFactories.kinds().length}§r generator kind(s)!`);

        // Here rather than in a world, because this runs before the shutdown awaits anything -
        // which matters when the thing being given up is the reason the event loop is busy. See
        // {@link Server.releaseOnShutdown} and {@link Generator.stopGenerating}.
        server.releaseOnShutdown(() => this.generatorFactories.stopGenerating());

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

        // Named as the default before it is enabled, not after. Enabling a world generates its
        // start region, which at `preload-radius: 24` is minutes, and until this assignment
        // `getDefaultWorld()` answered `undefined` while its type said `World` - so a command
        // typed at the console meanwhile threw a `TypeError` out of `CommandManager` instead of
        // running. Nothing about the world is missing here except its terrain: it has its game
        // rules, its name and its provider, which is what its callers ask it for.
        const world = this.buildWorld(worldData, defaultWorld);
        this.defaultWorld = world;
        this.server.getLogger().info(`Loading ${world.getFormattedName()} as default world!`);

        await this.enableWorld(world);
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
     * @param provider - the provider class, constructed per world with its folder path and the server
     */
    public addProvider(name: string, provider: ProviderClass) {
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
     * Get all registered provider classes by name.
     */
    public getProviders(): Map<string, ProviderClass> {
        return this.providers;
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
        const world = this.buildWorld(worldData, folderName);
        await this.enableWorld(world);

        return world;
    }

    /**
     * Builds a world and registers it, without generating anything.
     *
     * Separate from {@link WorldManager.enableWorld} because the two take wildly different
     * amounts of time and a caller may need the world during the second one. See
     * {@link WorldManager.enable}.
     * @param worldData - The provider key, generator and seed.
     * @param folderName - The folder under `worlds/` this world lives in.
     * @throws {Error} When the world is already loaded, or names a provider that is not
     * registered.
     */
    private buildWorld(worldData: WorldData, folderName: string): World {
        if (!worldData) throw new Error('Invalid world data');

        if (this.isWorldLoaded(folderName)) {
            throw new Error(`World ${folderName} has already been loaded`);
        }

        const levelPath = withCwd(WORLDS_FOLDER, folderName);
        const provider = this.providers.get(worldData.provider ?? DEFAULT_WORLD_PROVIDER);

        // A world is built once, so each old key the entry still uses is said once.
        const normalized = normalizeWorldData(worldData, this.generatorFactories.kinds());
        for (const deprecation of normalized.deprecations) {
            this.server.getLogger().warn(`World '${folderName}': ${deprecation}`);
        }

        const generator = this.generatorFactories.build({
            stem: overworldStemOf(normalized, Dimensions.Overworld.id),
            dimension: Dimensions.Overworld,
            seed: worldSeedOf(worldData.seed),
            content: () => this.server.getContent(),
            worldgen: () => (this.worldgenRegistries ??= requireJavaWorldgenRegistries()),
            logger: this.server.getLogger()
        });

        if (!provider) {
            // Named, and with the alternatives listed. The `Filesystem` provider was removed, so
            // this is the first thing an existing config carrying it will hit, and "invalid
            // provider" on its own left nowhere to go from there.
            throw new Error(
                `Unknown world provider '${worldData.provider}' for world '${folderName}'. ` +
                    `Available providers: ${[...this.providers.keys()].join(', ')}.`
            );
        }

        // The behavior families answer the random ticks, and they are reachable only through the
        // content registries. Read here rather than inside the world, because a world is built
        // from a config entry and the registries are the server's.
        const content = this.server.getContent();

        // Closed over rather than passed, because a world's handlers are built while the world
        // is being constructed and every one of them runs from its tick long afterwards.
        let built: World | undefined;
        const world = new World({
            name: folderName,
            path: levelPath,
            server: this.server,
            provider: new provider(levelPath, this.server),

            // The config holds whatever the file said; this is where it becomes a seed.
            seed: worldSeedOf(worldData.seed),
            generator,
            config: { ...worldData },
            randomTickHandlers: contentRandomTickHandlers({
                content,
                world: () => built,
                report: (identifier, error) => {
                    this.server.getLogger().error(error);
                    this.server
                        .getLogger()
                        .error(`§c${identifier}§r threw on a random tick; it will not be reported again`);
                }
            }),
            blockTickHandlers: contentBlockTickHandlers({
                content,
                world: () => built,
                report: (identifier, error) => {
                    this.server.getLogger().error(error);
                    this.server
                        .getLogger()
                        .error(`§c${identifier}§r threw on a scheduled block tick; it will not be reported again`);
                }
            }),
            redstoneUpdateHandlers: contentRedstoneUpdateHandlers({
                content,
                world: () => built,
                report: (identifier, error) => {
                    this.server.getLogger().error(error);
                    this.server
                        .getLogger()
                        .error(`§c${identifier}§r threw on a redstone update; it will not be reported again`);
                }
            })
        });
        built = world;
        this.worlds.set(world.getUUID(), world);
        const dimension = world.getDimension().name;
        const dimensionWorlds = this.worldsByDimension.get(dimension) ?? new Set<World>();
        dimensionWorlds.add(world);
        this.worldsByDimension.set(dimension, dimensionWorlds);

        // Given somewhere to report its changes before it starts running. Attached from here
        // rather than built by the world, which must not have to know the network layer
        // exists in order to announce that a block changed.
        world.attachChangeSink(this.server.getWorldReplicators().for(world));

        return world;
    }

    /**
     * Opens a world's provider and generates its start region.
     *
     * The long half of loading a world: the spawn search and the preload both generate terrain,
     * which is minutes rather than milliseconds.
     * @param world - A world {@link WorldManager.buildWorld} has already registered.
     */
    private async enableWorld(world: World): Promise<void> {
        await world.enable();
        this.server.getLogger().verbose(`World ${world.getFormattedName()} successfully loaded!`);
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
        const dimension = world.getDimension().name;
        const dimensionWorlds = this.worldsByDimension.get(dimension);
        dimensionWorlds?.delete(world);
        if (dimensionWorlds?.size === 0) this.worldsByDimension.delete(dimension);
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
     * Returns the first loaded world in a dimension without allocating the full world list.
     * @param dimension - The dimension identifier.
     * @returns The first loaded world in that dimension, or undefined.
     */
    public getWorldByDimension(dimension: string): World | undefined {
        return this.worldsByDimension.get(dimension)?.values().next().value;
    }

    /**
     * Returns the default world.
     * @returns {World} the world instance.
     */
    public getDefaultWorld(): World {
        return this.defaultWorld;
    }

    /** The generator kinds this server can build a dimension with. */
    public getGeneratorFactories(): GeneratorFactories {
        return this.generatorFactories;
    }

    /**
     * @deprecated Use {@link WorldManager.getGeneratorFactories}. Removed in the next release.
     */
    public getGeneratorManager(): GeneratorFactories {
        return this.generatorFactories;
    }
}

