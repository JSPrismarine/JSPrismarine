import type { WorldPreset } from '@jsprismarine/worldgen';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';

import type { Server, Service } from '../';
import { withCwd } from '../utils/cwd';
import { worldSeedOf } from '../utils/Seed';
import { GeneratorFactories } from './GeneratorFactories';
import { dimensionByName } from './Dimension';
import {
    findJavaWorldgenSources,
    loadJavaWorldgenRegistriesFrom,
    requireJavaWorldgenSources
} from './generators/datadriven/javaWorldgenData';
import type { JavaWorldgenRegistries } from './generators/datadriven/javaWorldgenData';
import { normalizeWorldData, worldDataOf } from '../config/normalizeWorldData';
import { BUILT_IN_WORLD_PRESETS, dimensionTypesOf, loadOf, resolveStems, worldPresetsOf } from './resolveStems';
import { contentRandomTickHandlers } from './randomTicks';
import { contentBlockTickHandlers } from './blockTicks';
import { contentRedstoneUpdateHandlers } from './redstoneUpdates';
import { Level } from './Level';
import type { World } from './World';
import type BaseProvider from './providers/BaseProvider';
import type { WorldGenSettings } from './WorldPersistence';

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

/** A level built and registered, and whether its save had no stems before this load. */
interface PreparedLevel {
    readonly level: Level;
    /** True when the save carried no `worldGenSettings`, which the first load then writes. */
    readonly firstLoad: boolean;
}

/**
 * Loads and unloads levels, one per `worlds.<name>` entry, and answers which world of the
 * default level holds a dimension.
 */
export default class WorldManager implements Service {
    /** The loaded levels by folder name, in load order. */
    private readonly levels = new Map<string, Level>();
    private defaultLevel!: Level;
    private defaultWorld!: World;
    private readonly generatorFactories = new GeneratorFactories();

    /** Java's worldgen registries, read once for every level that needs them. */
    private worldgenRegistries: JavaWorldgenRegistries | undefined;
    /** The world presets a `preset` may name, read once from the pack stack. */
    private worldPresets: ReadonlyMap<string, WorldPreset> | undefined;
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
     * On enable hook: loads every `worlds.*` entry as a level, the `level-name` one first.
     * @group Lifecycle
     * @throws {Error} When `level-name` is empty or names no `worlds` entry.
     */
    public async enable(): Promise<void> {
        this.addProvider('Anvil', Anvil);
        this.addProvider('LevelDB', LevelDB);

        const config = this.server.getConfig();
        const defaultName = config.getLevelName();
        // Throwing rather than warning-and-returning: `getDefaultWorld()` promises a world to
        // everyone downstream, and returning here would leave that promise unkept while the
        // type said otherwise.
        if (!defaultName) throw new Error(`Invalid level-name`);

        const worlds = config.getWorlds();
        const defaultData = worlds[defaultName];
        if (!defaultData) throw new Error(`Invalid level-name`);

        // Named as the default before it is enabled, not after. Enabling a level generates the
        // Overworld's start region, which at `preload-radius: 24` is minutes, and until this
        // assignment `getDefaultWorld()` answered `undefined` while its type said `World` - so
        // a command typed at the console meanwhile threw a `TypeError` out of `CommandManager`
        // instead of running. Nothing about the world is missing here except its terrain: it
        // has its game rules, its name and its provider, which is what its callers ask it for.
        // `Level.enable` builds its eager worlds before its first await, so the Overworld
        // exists the moment the call returns its promise.
        const prepared = await this.prepareLevel(defaultData, defaultName, { overworld: 'eager' });
        const enabling = prepared.level.enable();
        const world = prepared.level.loadedWorld(OVERWORLD_STEM_ID);
        if (world === undefined) throw new Error(`Level ${defaultName} built no ${OVERWORLD_STEM_ID} world`);
        this.defaultLevel = prepared.level;
        this.defaultWorld = world;
        this.server.getLogger().info(`Loading ${world.getFormattedName()} as default world!`);
        await this.finishLoading(prepared, enabling);

        // The other entries after the default, one at a time, so their log lines do not
        // interleave and the default's terrain is not competing with theirs for the workers.
        for (const [name, data] of Object.entries(worlds)) {
            if (name === defaultName) continue;
            await this.loadLevel(data, name);
        }
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
     * Loads a level: resolves its stems, opens its save, builds its eager worlds and writes the
     * stems into a save that had none.
     *
     * @param worldData - The `worlds.<name>` entry: provider key, preset, seed, dimensions.
     * @param folderName - The folder under `worlds/` the level lives in.
     * @throws {Error} When the level is already loaded, names a provider that is not
     *   registered, or its stems cannot be resolved.
     */
    public async loadLevel(worldData: WorldData, folderName: string): Promise<Level> {
        const prepared = await this.prepareLevel(worldData, folderName);
        await this.finishLoading(prepared, prepared.level.enable());
        return prepared.level;
    }

    /**
     * Loads a level and answers its Overworld, built if the entry marks it lazy.
     * @deprecated Use {@link WorldManager.loadLevel}. Removed in the next release.
     */
    public async loadWorld(worldData: WorldData, folderName: string): Promise<World> {
        const level = await this.loadLevel(worldData, folderName);
        return level.world(OVERWORLD_STEM_ID);
    }

    /** Waits for a level's enabling, then writes the stems into a save that had none. */
    private async finishLoading({ level, firstLoad }: PreparedLevel, enabling: Promise<void>): Promise<void> {
        await enabling;
        // A save keeps the stems it was generated with from its first load on, so a later config
        // edit is compared against them rather than silently regenerating different terrain.
        if (firstLoad) await level.saveLevelData();
        this.server
            .getLogger()
            .verbose(`Level §b${level.name}§r loaded with ${[...level.getStems().keys()].join(', ')}`);
    }

    /**
     * Builds a level and registers it, without building any world.
     *
     * Reads the entry in either spelling, logging each deprecated key once and writing the
     * entry back in the new spelling; reads the stems the save was generated with; resolves the
     * stems from the preset, the entry's `dimensions` and the saved ones; and resolves the
     * dimension types the stems name.
     *
     * @param worldData - The `worlds.<name>` entry.
     * @param folderName - The folder under `worlds/` the level lives in.
     * @param options - `overworld` forces the Overworld's load mode, which the default level
     *   needs eager whatever the entry says, since the server names it before anything else.
     * @throws {Error} When the level is already loaded, names a provider that is not
     *   registered, or its stems cannot be resolved.
     */
    private async prepareLevel(
        worldData: WorldData,
        folderName: string,
        options: { overworld?: 'eager' | 'lazy' } = {}
    ): Promise<PreparedLevel> {
        if (!worldData) throw new Error('Invalid world data');

        if (this.isWorldLoaded(folderName)) {
            throw new Error(`World ${folderName} has already been loaded`);
        }

        const levelPath = withCwd(WORLDS_FOLDER, folderName);
        const providerClass = this.providers.get(worldData.provider ?? DEFAULT_WORLD_PROVIDER);
        if (!providerClass) {
            // Named, and with the alternatives listed. The `Filesystem` provider was removed, so
            // this is the first thing an existing config carrying it will hit, and "invalid
            // provider" on its own left nowhere to go from there.
            throw new Error(
                `Unknown world provider '${worldData.provider}' for world '${folderName}'. ` +
                    `Available providers: ${[...this.providers.keys()].join(', ')}.`
            );
        }

        const logger = this.server.getLogger();
        // A level is built once, so each old key the entry still uses is said once, and the
        // entry is written back in the new spelling so the next start says nothing.
        const normalized = normalizeWorldData(worldData, this.generatorFactories.kinds());
        if (normalized.deprecations.length > 0) {
            for (const deprecation of normalized.deprecations) logger.warn(`World '${folderName}': ${deprecation}`);
            this.server.getConfig().setWorld(folderName, worldDataOf(normalized), true);
            logger.info(`World '${folderName}': rewrote its config entry as \`preset\` and \`dimensions\``);
        }

        // The config holds whatever the file said; this is where it becomes a seed.
        const seed = worldSeedOf(worldData.seed);
        const provider = new providerClass(levelPath, this.server);
        const saved = await this.savedWorldGenSettings(provider, folderName, seed);

        const registries = () => this.registries();
        const stems = resolveStems(normalized, this.presets(), saved, (line) => {
            logger.warn(`World '${folderName}': ${line}`);
        });
        const load = new Map(loadOf(normalized, stems));
        if (options.overworld !== undefined) load.set(OVERWORLD_STEM_ID, options.overworld);

        // The behavior families answer the random ticks, and they are reachable only through the
        // content registries. Read here rather than inside the level, because a level is built
        // from a config entry and the registries are the server's.
        const content = this.server.getContent();
        const report = (what: string) => (identifier: string, error: unknown) => {
            logger.error(error);
            logger.error(`§c${identifier}§r threw on ${what}; it will not be reported again`);
        };

        const level = new Level({
            name: folderName,
            path: levelPath,
            server: this.server,
            provider,
            seed,
            stems,
            dimensionTypes: dimensionTypesOf(stems, registries),
            load,
            factories: this.generatorFactories,
            worldgen: registries,
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

        return { level, firstLoad: saved === undefined };
    }

    /**
     * The stems a save was generated with, or undefined for a save that has none yet.
     *
     * The provider is opened and closed again for the read: the level that will own it does not
     * exist until the stems are known, and the level opens the provider itself.
     */
    private async savedWorldGenSettings(
        provider: BaseProvider,
        name: string,
        seed: bigint
    ): Promise<WorldGenSettings | undefined> {
        provider.setLevel({ name, seed });
        await provider.enable();
        try {
            return (await provider.readWorldData())?.worldGenSettings;
        } finally {
            await provider.disable();
        }
    }

    /**
     * Java's worldgen registries, projected from the server's pack stack the first time a level
     * needs them.
     *
     * The stack is what `ServerContent` composed: the vanilla datapack and every world and
     * plugin datapack after it, so a `dimension_type` or `noise_settings` document a datapack
     * adds reaches the stems and the noise factory. The biome parameter reports are no
     * datapack's content and come from the Java data cache.
     *
     * @throws {Error} When the Java data cache is cold, naming what to fetch.
     */
    private registries(): JavaWorldgenRegistries {
        return (this.worldgenRegistries ??= loadJavaWorldgenRegistriesFrom(
            this.server.getContent().definitions,
            requireJavaWorldgenSources().reports
        ));
    }

    /**
     * The presets a `preset` may name: the two built-in Overworld-only ones, with every
     * `worldgen/world_preset` the pack stack carries over them. The vanilla datapack's seven
     * replace both built-ins when the Java data cache is warm.
     */
    private presets(): ReadonlyMap<string, WorldPreset> {
        return (this.worldPresets ??=
            findJavaWorldgenSources() === undefined
                ? BUILT_IN_WORLD_PRESETS
                : new Map([...BUILT_IN_WORLD_PRESETS, ...worldPresetsOf(this.registries())]));
    }

    /** Gives a world somewhere to report its changes. */
    private registerWorld(world: World): void {
        // Attached from here rather than built by the world, which must not have to know the
        // network layer exists in order to announce that a block changed.
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

    /** The `level-name` level, which players join and whose dimensions the commands address. */
    public getDefaultLevel(): Level {
        return this.defaultLevel;
    }

    /**
     * The Overworld of the level with that folder name, or null when none is loaded.
     */
    public getWorldByName(folderName: string): World | null {
        return this.getLevel(folderName)?.loadedWorld(OVERWORLD_STEM_ID) ?? null;
    }

    /**
     * Every loaded world of every loaded level.
     * @deprecated Ask a {@link Level} for its worlds, or the manager for
     *   {@link WorldManager.getWorldByDimension}. Removed in the next release.
     */
    public getWorlds(): World[] {
        return this.getLevels().flatMap((level) => [...level.worlds()]);
    }

    /**
     * The default level's loaded world of a dimension, without building one.
     *
     * @param dimension - A Java `dimension_type` id such as `minecraft:the_nether`, or the
     *   Bedrock spelling of a vanilla one, which is how the content runtime keys its worlds.
     * @returns The world, or undefined before the default level exists or while that dimension
     *   is still lazy.
     */
    public getWorldByDimension(dimension: string): World | undefined {
        const wanted = dimensionByName(dimension)?.id ?? dimension;
        for (const world of this.defaultLevel?.worlds() ?? []) {
            if (world.getDimension().id === wanted) return world;
        }
        return undefined;
    }

    /**
     * The default level's world of a dimension, built and enabled if it is not yet.
     *
     * @param dimension - A Java `dimension_type` id, or the Bedrock spelling of a vanilla one.
     * @throws {Error} When no stem of the default level has that dimension, naming the ones
     *   that do, or when the stem's generator cannot be built.
     */
    public async worldFor(dimension: string): Promise<World> {
        const level = this.getDefaultLevel();
        const wanted = dimensionByName(dimension)?.id ?? dimension;
        const stems = level.getStems();

        // By stem id first, which is how the vanilla three are named, then by the type a stem
        // binds, which is how a pack's dimension is reached by the type it declares.
        let stemId = stems.has(wanted) ? wanted : undefined;
        for (const [id, stem] of stems) {
            if (stemId !== undefined) break;
            if (stem.type === wanted) stemId = id;
        }
        if (stemId === undefined) {
            throw new Error(
                `Level ${level.name} has no ${dimension} dimension. It has: ${[...stems.keys()].join(', ')}`
            );
        }
        return level.world(stemId);
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
}
