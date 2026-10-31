import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';

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
import { Level } from './Level';
import type { World } from './World';
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
 * Loads and unloads levels, one per `worlds.<name>` entry, and answers which world holds a
 * dimension.
 */
export default class WorldManager implements Service {
    /** The loaded levels by folder name, in load order. */
    private readonly levels = new Map<string, Level>();
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

        // Named as the default before it is enabled, not after. Enabling a level generates the
        // Overworld's start region, which at `preload-radius: 24` is minutes, and until this
        // assignment `getDefaultWorld()` answered `undefined` while its type said `World` - so
        // a command typed at the console meanwhile threw a `TypeError` out of `CommandManager`
        // instead of running. Nothing about the world is missing here except its terrain: it
        // has its game rules, its name and its provider, which is what its callers ask it for.
        // `Level.enable` builds its eager worlds before its first await, so the Overworld
        // exists the moment the call returns its promise.
        const level = this.buildLevel(worldData, defaultWorld);
        const enabling = level.enable();
        const world = level.loadedWorld(OVERWORLD_STEM_ID);
        if (world === undefined) throw new Error(`Level ${defaultWorld} built no ${OVERWORLD_STEM_ID} world`);
        this.defaultWorld = world;
        this.server.getLogger().info(`Loading ${world.getFormattedName()} as default world!`);

        await enabling;
        this.server.getLogger().verbose(`World ${world.getFormattedName()} successfully loaded!`);
    }

    /**
     * On disable hook.
     *
     * Signifies that the manager is being disabled and all worlds should be unloaded.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        await Promise.all([...this.levels.keys()].map(async (name) => this.unloadWorld(name)));
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
     * Saves every loaded level to disk.
     */
    public async save(): Promise<void> {
        this.server.getLogger().info('Saving worlds');
        for (const level of this.levels.values()) {
            await level.save();
        }
    }

    /**
     * Loads a level and answers its Overworld.
     *
     * @param worldData - The `worlds.<name>` entry: provider key, preset, seed.
     * @param folderName - The folder under `worlds/` the level lives in.
     */
    public async loadWorld(worldData: WorldData, folderName: string): Promise<World> {
        const level = this.buildLevel(worldData, folderName);
        await level.enable();

        const world = level.loadedWorld(OVERWORLD_STEM_ID);
        if (world === undefined) throw new Error(`Level ${folderName} built no ${OVERWORLD_STEM_ID} world`);
        this.server.getLogger().verbose(`World ${world.getFormattedName()} successfully loaded!`);
        return world;
    }

    /**
     * Builds a level and registers it, without opening anything.
     *
     * The stems are the Overworld's alone for now: the one the entry's preset or its
     * `dimensions['minecraft:overworld']` override names, through {@link overworldStemOf}. The
     * other stems of the preset, and a saved `worldGenSettings` that disagrees with the config,
     * are read when the level loader lands.
     * @param worldData - The `worlds.<name>` entry.
     * @param folderName - The folder under `worlds/` the level lives in.
     * @throws {Error} When the level is already loaded, or names a provider that is not
     * registered.
     */
    private buildLevel(worldData: WorldData, folderName: string): Level {
        if (!worldData) throw new Error('Invalid world data');

        if (this.isWorldLoaded(folderName)) {
            throw new Error(`World ${folderName} has already been loaded`);
        }

        const levelPath = withCwd(WORLDS_FOLDER, folderName);
        const provider = this.providers.get(worldData.provider ?? DEFAULT_WORLD_PROVIDER);
        if (!provider) {
            // Named, and with the alternatives listed. The `Filesystem` provider was removed, so
            // this is the first thing an existing config carrying it will hit, and "invalid
            // provider" on its own left nowhere to go from there.
            throw new Error(
                `Unknown world provider '${worldData.provider}' for world '${folderName}'. ` +
                    `Available providers: ${[...this.providers.keys()].join(', ')}.`
            );
        }

        // A level is built once, so each old key the entry still uses is said once.
        const normalized = normalizeWorldData(worldData, this.generatorFactories.kinds());
        for (const deprecation of normalized.deprecations) {
            this.server.getLogger().warn(`World '${folderName}': ${deprecation}`);
        }

        // The behavior families answer the random ticks, and they are reachable only through the
        // content registries. Read here rather than inside the level, because a level is built
        // from a config entry and the registries are the server's.
        const content = this.server.getContent();
        const report = (what: string) => (identifier: string, error: unknown) => {
            this.server.getLogger().error(error);
            this.server.getLogger().error(`§c${identifier}§r threw on ${what}; it will not be reported again`);
        };

        const level = new Level({
            name: folderName,
            path: levelPath,
            server: this.server,
            provider: new provider(levelPath, this.server),
            // The config holds whatever the file said; this is where it becomes a seed.
            seed: worldSeedOf(worldData.seed),
            stems: new Map([[OVERWORLD_STEM_ID, overworldStemOf(normalized, Dimensions.Overworld.id)]]),
            dimensionTypes: new Map([[Dimensions.Overworld.id, Dimensions.Overworld.java]]),
            // The Overworld is where every player joins, so it is built with the level.
            load: new Map([[OVERWORLD_STEM_ID, 'eager']]),
            factories: this.generatorFactories,
            worldgen: () => (this.worldgenRegistries ??= requireJavaWorldgenRegistries()),
            config: { ...worldData },
            handlers: (world) => ({
                randomTickHandlers: contentRandomTickHandlers({ content, world, report: report('a random tick') }),
                blockTickHandlers: contentBlockTickHandlers({
                    content,
                    world,
                    report: report('a scheduled block tick')
                }),
                redstoneUpdateHandlers: contentRedstoneUpdateHandlers({
                    content,
                    world,
                    report: report('a redstone update')
                })
            }),
            onWorldBuilt: (world) => this.registerWorld(world)
        });
        this.levels.set(folderName, level);

        return level;
    }

    /** Indexes a world by its dimension and gives it somewhere to report its changes. */
    private registerWorld(world: World): void {
        const dimension = world.getDimension().name;
        const dimensionWorlds = this.worldsByDimension.get(dimension) ?? new Set<World>();
        dimensionWorlds.add(world);
        this.worldsByDimension.set(dimension, dimensionWorlds);

        // Given somewhere to report its changes before it starts running. Attached from here
        // rather than built by the world, which must not have to know the network layer
        // exists in order to announce that a block changed.
        world.attachChangeSink(this.server.getWorldReplicators().for(world));
    }

    /**
     * Unloads a level by its folder name: every world of it saves and closes, then its
     * provider.
     */
    public async unloadWorld(folderName: string): Promise<void> {
        const level = this.getLevel(folderName);
        if (level === undefined) {
            this.server.getLogger().error(`Cannot unload a not loaded world with name §b${folderName}`);
            return;
        }

        await level.disable();
        this.levels.delete(level.name);
        for (const world of level.worlds()) {
            const dimension = world.getDimension().name;
            const dimensionWorlds = this.worldsByDimension.get(dimension);
            dimensionWorlds?.delete(world);
            if (dimensionWorlds?.size === 0) this.worldsByDimension.delete(dimension);
            this.server.getLogger().verbose(`Successfully unloaded world ${world.getFormattedName()}!`);
        }
    }

    /**
     * Whether a level of that folder name is loaded.
     * @returns {boolean} true if the level is loaded, false otherwise
     */
    public isWorldLoaded(folderName: string): boolean {
        return this.getLevel(folderName) !== undefined;
    }

    /** The loaded level of a folder name, compared case-insensitively, or undefined. */
    public getLevel(folderName: string): Level | undefined {
        const wanted = folderName.toLowerCase();
        for (const level of this.levels.values()) {
            if (level.name.toLowerCase() === wanted) return level;
        }
        return undefined;
    }

    /** Every loaded level, in load order. */
    public getLevels(): Level[] {
        return Array.from(this.levels.values());
    }

    /**
     * The Overworld of the level with that folder name, or null when none is loaded.
     */
    public getWorldByName(folderName: string): World | null {
        return this.getLevel(folderName)?.loadedWorld(OVERWORLD_STEM_ID) ?? null;
    }

    /**
     * Every loaded world of every loaded level.
     */
    public getWorlds(): World[] {
        return this.getLevels().flatMap((level) => [...level.worlds()]);
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
