import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

import { PrismarineWorldErrors } from '@jsprismarine/errors/prismarine/world';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';

import type { WorldData } from '../config/JsonConfigTypes';
import { normalizeWorldData, worldDataOf } from '../config/normalizeWorldData';
import type Server from '../Server';
import { withCwd } from '../utils/cwd';
import type { Service } from '../utils/Service';
import { worldSeedOf } from '../utils/Seed';
import { contentBlockTickHandlers } from './blockTicks';
import type { SavedDimensionNumbers } from './DimensionNumbers';
import { dimensionByName } from './DimensionType';
import type { GeneratorFactories } from './GeneratorFactories';
import { Level } from './Level';
import { LevelProviders } from './LevelProviders';
import type BaseProvider from './providers/BaseProvider';
import { contentRandomTickHandlers } from './randomTicks';
import { contentRedstoneUpdateHandlers } from './redstoneUpdates';
import { dimensionTypesOf, loadOf, resolveStems } from './resolveStems';
import type { World } from './World';
import { WorldgenCatalog } from './WorldgenCatalog';
import { LEVELS_FILE_NAME, LevelRegistry } from './LevelRegistry';
import { transferToLevel } from './levelTransfer';
import { PLAYER_LEVELS_FILE_NAME, PlayerLevels } from './PlayerLevels';
import type { RegisteredLevel } from './LevelRegistry';
import type { WorldGenSettings } from './WorldPersistence';
import LevelAttachedEvent from '../events/level/LevelAttachedEvent';
import LevelDetachedEvent from '../events/level/LevelDetachedEvent';
import LevelDetachingEvent from '../events/level/LevelDetachingEvent';
import { SerialQueue } from '../utils/serialQueue';

export type { WorldData } from '../config/JsonConfigTypes';

const WORLDS_FOLDER = 'worlds';

/** What a level created while the server runs may be named, since the name also names its folder. */
const LEVEL_NAME = /^[A-Za-z0-9_-]{1,64}$/;

/** Where a level comes from: the config's `worlds`, or `levels.json`, which records the ones created at runtime. */
export type LevelOrigin = 'config' | 'registry';

/**
 * Where a level is in its lifecycle. A level the manager has no state for is detached: not loaded,
 * its files left as they were.
 */
export type LevelState = 'attaching' | 'attached' | 'detaching';

/** How long a detach waits for the level's players to arrive in the entry level before it goes on without them. */
const EVACUATION_TICKS = 200;

/** A level built and registered, and whether its save had no stems or no UUID before this load. */
interface PreparedLevel {
    readonly level: Level;
    /** True when the save carried no `worldGenSettings` or no `levelId`, which the first load then writes. */
    readonly firstLoad: boolean;
}

/** What a save already holds that decides the level built over it. */
interface SavedLevel {
    /** The stems the save was generated with, or undefined for a save that has none yet. */
    readonly worldGenSettings?: WorldGenSettings;
    /** The level's UUID, or undefined for a save written before levels had one. */
    readonly levelId?: string;
    /** The custom dimension numbers, or undefined for a save written before it kept them. */
    readonly dimensionNumbers?: SavedDimensionNumbers;
}

/**
 * The server's levels: it loads the config's `worlds` entries and the attached levels of
 * `levels.json`, creates, attaches and detaches levels while the server runs, announces each step
 * of a level's lifecycle, and answers which world of a level holds a dimension
 * ([ADR 0029](../../../../docs/adr/0029-worlds-are-levels-the-server-manages.md)).
 */
export default class WorldManager implements Service {
    /** The loaded levels by UUID, in load order. */
    private readonly levels = new Map<string, Level>();
    /** Each loaded level's place in its lifecycle, by UUID. */
    private readonly states = new Map<string, LevelState>();
    /** Attaches and detaches, one at a time, so two of them never race over one level or one name. */
    private readonly operations = new SerialQueue();
    /** Where each loaded level comes from, by UUID: the config's `worlds`, or `levels.json`. */
    private readonly origins = new Map<string, LevelOrigin>();
    /** The levels created while the server ran, which `levels.json` records. */
    private readonly registry: LevelRegistry;
    /** The level each player was last in, when not the entry level. */
    private readonly playerLevels: PlayerLevels;
    /** Each dimension name asked for, resolved to the dimension type id it names; the table never changes. */
    private readonly dimensionIds = new Map<string, string>();
    /** The `level-name` level, which a joining player enters first. */
    private entryLevel!: Level;
    /** The entry level's Overworld. */
    private entryWorld!: World;
    /** The generator kinds, Java worldgen data and terrain cache every level builds from. */
    private readonly worldgen: WorldgenCatalog;
    /** The provider classes a level's entry can name. */
    private readonly providers = new LevelProviders();
    private readonly server: Server;

    /** How a detach moves a player out of its level: {@link transferToLevel}, unless a test hands in another. */
    private readonly transfer: typeof transferToLevel;

    /**
     * @param server - The server.
     * @param options - `transfer` replaces how a detach moves a player to the entry level.
     */
    public constructor(server: Server, options: { readonly transfer?: typeof transferToLevel } = {}) {
        this.server = server;
        this.transfer = options.transfer ?? transferToLevel;
        this.worldgen = new WorldgenCatalog(server);
        this.registry = new LevelRegistry(withCwd(LEVELS_FILE_NAME), server.getLogger());
        this.playerLevels = new PlayerLevels(withCwd(PLAYER_LEVELS_FILE_NAME), server.getLogger());
        server.getLogger().verbose(`Registered §b${this.worldgen.factories.kinds().length}§r generator kind(s)!`);

        // Here rather than in a world, because this runs before the shutdown awaits anything -
        // which matters when the thing being given up is the reason the event loop is busy. See
        // {@link Server.releaseOnShutdown} and {@link Generator.stopGenerating}.
        server.releaseOnShutdown(() => this.worldgen.factories.stopGenerating());

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
        const config = this.server.getConfig();
        const invalidHost = config.getInvalidChunkHost();
        if (invalidHost !== undefined) {
            this.server
                .getLogger()
                .warn(`chunk-host "${invalidHost}" is not process or in-process, so process is used`);
        }
        const defaultName = config.getLevelName();
        // Throwing rather than warning-and-returning: `getEntryWorld()` promises a world to
        // everyone downstream, and returning here would leave that promise unkept while the
        // type said otherwise.
        if (!defaultName) throw new PrismarineWorldErrors.InvalidLevelName();

        const worlds = config.getWorlds();
        const defaultData = worlds[defaultName];
        if (!defaultData) throw new PrismarineWorldErrors.InvalidLevelName();

        // Named as the default before it is enabled, not after. Enabling a level generates the
        // Overworld's start region, which at `preload-radius: 24` is minutes, and until this
        // assignment `getEntryWorld()` answered `undefined` while its type said `World` - so
        // a command typed at the console meanwhile threw a `TypeError` out of `CommandManager`
        // instead of running. Nothing about the world is missing here except its terrain: it
        // has its game rules, its name and its provider, which is what its callers ask it for.
        // `Level.enable` builds its eager worlds before its first await, so the Overworld
        // exists the moment the call returns its promise.
        const prepared = await this.operations.run(() =>
            this.prepareLevel(defaultData, defaultName, { overworld: 'eager' })
        );
        const enabling = prepared.level.enable();
        const world = prepared.level.loadedWorld(OVERWORLD_STEM_ID);
        if (world === undefined)
            throw new PrismarineWorldErrors.LevelWithoutOverworld({ defaultName, overworldStemId: OVERWORLD_STEM_ID });
        this.entryLevel = prepared.level;
        this.entryWorld = world;
        this.server.getLogger().info(`Loading ${world.getFormattedName()} as the entry world!`);
        await this.operations.run(() => this.finishLoading(prepared, enabling));

        // The other entries after the default, one at a time, so their log lines do not
        // interleave and the default's terrain is not competing with theirs for the workers.
        for (const [name, data] of Object.entries(worlds)) {
            if (name === defaultName) continue;
            await this.loadLevel(data, name);
        }

        // Then the levels created while the server ran, those recorded as attached.
        await this.playerLevels.load();
        await this.registry.load();
        for (const record of this.registry.all()) {
            if (record.state !== 'attached') continue;
            try {
                await this.operations.run(() => this.attachRegistered(record));
            } catch (error: unknown) {
                this.server.getLogger().error(`Level ${record.name} (${record.id}) from levels.json did not attach`);
                this.server.getLogger().error(error);
            }
        }
    }

    /**
     * Creates a level while the server runs, records it in `levels.json` as attached and attaches
     * it. It never goes into the config.
     *
     * @param name - The level's name: letters, digits, underscores and hyphens.
     * @param world - What the level is created with, in the shape of a `worlds.<name>` entry.
     * @throws {Error} When the name is not one, or an attached or configured level has it.
     */
    public createLevel(name: string, world: WorldData): Promise<Level> {
        return this.operations.run(async () => {
            if (!LEVEL_NAME.test(name)) throw new PrismarineWorldErrors.InvalidNewLevelName({ name });
            this.checkNameFree(name);
            const folder = this.newFolder(name);
            const prepared = await this.prepareLevel(world, name, { origin: 'registry', folder });
            const { level } = prepared;
            await this.registry.put({ id: level.id, name, folder, state: 'attached', world });
            await this.finishLoading(prepared, level.enable());
            return level;
        });
    }

    /**
     * Attaches a detached level from `levels.json`, by its UUID or its name, and records it as
     * attached.
     *
     * @throws {Error} When no detached level has the UUID or name, more than one has the name, or an
     *   attached or configured level has its name.
     */
    public attachLevel(nameOrId: string): Promise<Level> {
        return this.operations.run(async () => {
            const byId = this.registry.get(nameOrId);
            const wanted = nameOrId.toLowerCase();
            const candidates =
                byId?.state === 'detached'
                    ? [byId]
                    : this.registry
                          .all()
                          .filter((record) => record.state === 'detached' && record.name.toLowerCase() === wanted);
            const [record, ...others] = candidates;
            if (record === undefined) throw new PrismarineWorldErrors.LevelNotRegistered({ name: nameOrId });
            if (others.length > 0) {
                throw new PrismarineWorldErrors.AmbiguousLevelName({
                    name: nameOrId,
                    ids: candidates.map((candidate) => candidate.id).join(', ')
                });
            }
            const level = await this.attachRegistered(record);
            await this.registry.put({ ...record, state: 'attached' });
            return level;
        });
    }

    /** The level each player was last in, which a transfer between levels records. */
    public getPlayerLevels(): PlayerLevels {
        return this.playerLevels;
    }

    /**
     * The attached level a returning player left from, or undefined for the entry level, or for a
     * level that is not attached now, whose player then joins the entry level.
     */
    public returningLevelOf(playerKey: string): Level | undefined {
        const id = this.playerLevels.levelOf(playerKey);
        if (id === undefined) return undefined;
        const level = this.getLevelById(id);
        return level !== undefined && this.states.get(level.id) === 'attached' ? level : undefined;
    }

    /** The levels `levels.json` records, attached and detached. */
    public getRegisteredLevels(): readonly RegisteredLevel[] {
        return this.registry.all();
    }

    /** Where a loaded level comes from, or undefined for one that is not loaded. */
    public getLevelOrigin(level: Level): LevelOrigin | undefined {
        return this.origins.get(level.id);
    }

    /** Loads a registered level from its folder, refusing it when an attached or configured level has its name. */
    private async attachRegistered(record: RegisteredLevel): Promise<Level> {
        this.checkNameFree(record.name);
        const prepared = await this.prepareLevel(record.world, record.name, {
            origin: 'registry',
            folder: record.folder
        });
        if (prepared.level.id !== record.id) {
            this.server
                .getLogger()
                .warn(
                    `Level ${record.name}'s save holds UUID ${prepared.level.id}, not the ${record.id} levels.json records for its folder`
                );
        }
        await this.finishLoading(prepared, prepared.level.enable());
        return prepared.level;
    }

    /** Throws when an attached level, or a level the config declares, has a name. */
    private checkNameFree(name: string): void {
        const wanted = name.toLowerCase();
        const configured = Object.keys(this.server.getConfig().getWorlds()).some((key) => key.toLowerCase() === wanted);
        if (configured || this.isWorldLoaded(name)) throw new PrismarineWorldErrors.LevelNameTaken({ name });
    }

    /**
     * A folder under `worlds/` for a new level: its name, or its name with a random suffix when a
     * folder or a registered level has that one already, since detached levels may share a name.
     */
    private newFolder(name: string): string {
        const taken = (folder: string) =>
            fs.existsSync(withCwd(WORLDS_FOLDER, folder)) ||
            this.registry.all().some((record) => record.folder.toLowerCase() === folder.toLowerCase());
        let folder = name;
        while (taken(folder)) folder = `${name}-${randomUUID().slice(0, 8)}`;
        return folder;
    }

    /**
     * On disable hook.
     *
     * Signifies that the manager is being disabled and all worlds should be unloaded.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        await Promise.all([...this.levels.values()].map(async (level) => this.unloadWorld(level.name)));
    }

    /** The provider classes a level's entry can name, which a plugin can add to. */
    public getProviders(): LevelProviders {
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
    public loadLevel(worldData: WorldData, folderName: string): Promise<Level> {
        return this.operations.run(async () => {
            const prepared = await this.prepareLevel(worldData, folderName);
            await this.finishLoading(prepared, prepared.level.enable());
            return prepared.level;
        });
    }

    /**
     * Waits for a level's enabling, writes the stems into a save that had none, and announces
     * the level attached.
     */
    private async finishLoading({ level, firstLoad }: PreparedLevel, enabling: Promise<void>): Promise<void> {
        try {
            await enabling;
        } catch (error: unknown) {
            this.states.delete(level.id);
            throw error;
        }
        // A save keeps the stems it was generated with from its first load on, so a later config
        // edit is compared against them rather than silently regenerating different terrain.
        // So are the numbers of the custom dimensions, which the next start has to find again.
        if (firstLoad || level.hasUnsavedDimensionNumbers()) await level.saveLevelData();
        this.server
            .getLogger()
            .verbose(`Level §b${level.name}§r loaded with ${[...level.getStems().keys()].join(', ')}`);
        this.states.set(level.id, 'attached');
        await this.server.getKernel().events.emit('levelAttached', new LevelAttachedEvent(level));
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
     * @param options - `overworld` forces the Overworld's load mode, which the entry level
     *   needs eager whatever the entry says, since the server names it before anything else.
     * @throws {Error} When the level is already loaded, names a provider that is not
     *   registered, or its stems cannot be resolved.
     */
    private async prepareLevel(
        worldData: WorldData,
        folderName: string,
        options: { overworld?: 'eager' | 'lazy'; origin?: LevelOrigin; folder?: string } = {}
    ): Promise<PreparedLevel> {
        if (!worldData) throw new PrismarineWorldErrors.InvalidWorldConfig();

        if (this.isWorldLoaded(folderName)) {
            throw new PrismarineWorldErrors.WorldAlreadyLoaded({ folderName });
        }

        const origin = options.origin ?? 'config';
        const levelPath = withCwd(WORLDS_FOLDER, options.folder ?? folderName);
        const providerClass = this.providers.get(worldData.provider);
        if (!providerClass) {
            // Named, and with the alternatives listed. The `Filesystem` provider was removed, so
            // this is the first thing an existing config carrying it will hit, and "invalid
            // provider" on its own left nowhere to go from there.
            throw new PrismarineWorldErrors.UnknownWorldProvider({
                provider: worldData.provider,
                folderName,
                providers: this.providers.names().join(', ')
            });
        }

        const logger = this.server.getLogger();
        // A level is built once, so each old key the entry still uses is said once, and the
        // entry is written back in the new spelling so the next start says nothing.
        const normalized = normalizeWorldData(worldData, this.worldgen.factories.kinds());
        if (normalized.deprecations.length > 0) {
            for (const deprecation of normalized.deprecations) logger.warn(`World '${folderName}': ${deprecation}`);
            // Only the config's entries are written back: a registered level was created in the
            // new spelling.
            if (origin === 'config') {
                this.server.getConfig().setWorld(folderName, worldDataOf(normalized), true);
                logger.info(`World '${folderName}': rewrote its config entry as \`preset\` and \`dimensions\``);
            }
        }

        // The config holds whatever the file said; this is where it becomes a seed.
        const seed = worldSeedOf(worldData.seed);
        const provider = new providerClass(levelPath, this.server);
        const saved = await this.savedLevel(provider, folderName, seed);

        const stems = resolveStems(normalized, this.worldgen.presets(), saved.worldGenSettings, (line) => {
            logger.warn(`World '${folderName}': ${line}`);
        });
        const load = new Map(loadOf(normalized, stems));
        if (options.overworld !== undefined) load.set(OVERWORLD_STEM_ID, options.overworld);

        // The behavior families answer the random ticks, and they are reachable only through the
        // content registries. Read here rather than inside the level, because a level is built
        // from a config entry and the registries are the server's.
        const content = this.server.getContent();
        const dimensionTypeDefinitions = new Map(
            [...content.definitions.dimensionTypes].map(([id, definition]) => [id, definition.data])
        );
        const registries = () => this.worldgen.registries();
        const report = (what: string) => (identifier: string, error: unknown) => {
            logger.error(error);
            logger.error(`§c${identifier}§r threw on ${what}; it will not be reported again`);
        };

        const level = new Level({
            // A save from before levels had a UUID gets one now, which its first load writes.
            id: saved.levelId ?? randomUUID(),
            ...(saved.dimensionNumbers === undefined ? {} : { dimensionNumbers: saved.dimensionNumbers }),
            name: folderName,
            path: levelPath,
            server: this.server,
            provider,
            seed,
            stems,
            dimensionTypes: dimensionTypesOf(stems, () => dimensionTypeDefinitions),
            load,
            factories: this.worldgen.factories,
            javaTarget: content.javaTarget,
            worldgen: registries,
            chunkWorkers: this.server.getConfig().getChunkWorkers(),
            chunkHost: this.server.getConfig().getChunkHost(),
            ...this.worldgen.terrainCacheOption(),
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
        this.levels.set(level.id, level);
        this.states.set(level.id, 'attaching');
        this.origins.set(level.id, origin);

        return { level, firstLoad: saved.worldGenSettings === undefined || saved.levelId === undefined };
    }

    /**
     * What a save already holds of its level: the stems it was generated with and its UUID.
     *
     * The provider is opened and closed again for the read: the level that will own it does not
     * exist until the stems are known, and the level opens the provider itself.
     */
    private async savedLevel(provider: BaseProvider, name: string, seed: bigint): Promise<SavedLevel> {
        provider.setLevel({ name, seed });
        await provider.enable();
        try {
            const data = await provider.readWorldData();
            return {
                ...(data?.worldGenSettings === undefined ? {} : { worldGenSettings: data.worldGenSettings }),
                ...(data?.levelId === undefined ? {} : { levelId: data.levelId }),
                ...(data?.dimensionNumbers === undefined ? {} : { dimensionNumbers: data.dimensionNumbers })
            };
        } finally {
            await provider.disable();
        }
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
        this.levels.delete(level.id);
        this.states.delete(level.id);
        this.origins.delete(level.id);
        // After the save, which reads them: a level loaded again under this name would otherwise
        // be handed the runtimes, and the entities, of this one.
        if (this.server.hasEntityRuntime()) this.server.getContentWorld().closeLevel(level.name);
        for (const world of level.worlds()) {
            this.server.getLogger().verbose(`Successfully unloaded world ${world.getFormattedName()}!`);
        }
    }

    /**
     * Detaches a level while the server runs: announces it detaching, which stops its scripts,
     * moves its players to the entry level's spawn, saves and closes it, and announces it
     * detached. Its files stay, so loading it again opens the same save.
     *
     * @param folderName - The level's name.
     * @throws {Error} When no attached level has the name, or it is the entry level, which players
     *   join first.
     */
    public detachLevel(folderName: string): Promise<void> {
        return this.operations.run(async () => {
            const level = this.getLevel(folderName);
            if (level === undefined || this.states.get(level.id) !== 'attached')
                throw new PrismarineWorldErrors.LevelNotAttached({ name: folderName });
            if (level === this.entryLevel) throw new PrismarineWorldErrors.EntryLevelCannotDetach({ name: level.name });
            if (this.origins.get(level.id) === 'config')
                throw new PrismarineWorldErrors.ConfigLevelCannotDetach({ name: level.name });

            this.states.set(level.id, 'detaching');
            const events = this.server.getKernel().events;
            await events.emit('levelDetaching', new LevelDetachingEvent(level));
            await this.evacuate(level);
            await this.unloadWorld(level.name);
            const record = this.registry.get(level.id);
            if (record !== undefined) await this.registry.put({ ...record, state: 'detached' });
            await events.emit('levelDetached', new LevelDetachedEvent(level));
        });
    }

    /**
     * Sends every player in a level to the entry level's spawn, and waits up to
     * {@link EVACUATION_TICKS} ticks for them to arrive there. A player still in the level then is
     * disconnected, since the level is about to close under them.
     */
    private async evacuate(level: Level): Promise<void> {
        const inLevel = () =>
            this.server
                .getSessionManager()
                .getSessions()
                .filter((session) => session.getWorld().getLevel() === level);
        const leaving = inLevel();
        if (leaving.length === 0) return;
        for (const session of leaving) {
            void this.transfer(this.server, session, this.entryLevel).catch((error: unknown) => {
                this.server.getLogger().error(error);
            });
        }
        if (inLevel().length === 0) return;

        const events = this.server.getKernel().events;
        await new Promise<void>((resolve) => {
            let ticks = 0;
            const stop = events.on('tick', () => {
                ticks++;
                if (inLevel().length > 0 && ticks < EVACUATION_TICKS) return;
                stop();
                resolve();
            });
        });
        for (const session of inLevel()) {
            await session.kick(`The level ${level.name} was detached.`);
        }
    }

    /** Where a loaded level is in its lifecycle, or undefined for a level that is not loaded. */
    public getLevelState(level: Level): LevelState | undefined {
        return this.states.get(level.id);
    }

    /**
     * Whether a level of that folder name is loaded.
     * @returns {boolean} true if the level is loaded, false otherwise
     */
    public isWorldLoaded(folderName: string): boolean {
        return this.getLevel(folderName) !== undefined;
    }

    /**
     * The loaded level of a folder name, or undefined. Names compare case-insensitively, as
     * every lookup by name here does, since the folders they name do on some file systems.
     */
    public getLevel(folderName: string): Level | undefined {
        const wanted = folderName.toLowerCase();
        for (const level of this.levels.values()) {
            if (level.name.toLowerCase() === wanted) return level;
        }
        return undefined;
    }

    /** The loaded level with a UUID, or undefined. */
    public getLevelById(id: string): Level | undefined {
        return this.levels.get(id.toLowerCase());
    }

    /** Every loaded level, in load order. */
    public getLevels(): Level[] {
        return Array.from(this.levels.values());
    }

    /**
     * The entry level: the one `level-name` names, which a joining player enters first. It is the
     * level of the console, the datapack functions and a lookup that names no level, and no other
     * code should reach for it when it has the level of a player, command or block in hand.
     */
    public getEntryLevel(): Level {
        return this.entryLevel;
    }

    /**
     * The Overworld of the level with that folder name, or null when none is loaded.
     */
    public getWorldByName(folderName: string): World | null {
        return this.getLevel(folderName)?.loadedWorld(OVERWORLD_STEM_ID) ?? null;
    }

    /**
     * A level's loaded world of a dimension, without building one.
     *
     * @param dimension - A Java `dimension_type` id such as `minecraft:the_nether`, or the
     *   Bedrock spelling of a vanilla one, which is how the content runtime keys its worlds.
     * @param level - The level's name; left out for the entry level.
     * @returns The world, or undefined before the level exists or while that dimension is still
     *   lazy.
     */
    public getWorldByDimension(dimension: string, level?: string): World | undefined {
        return this.levelOf(level)?.readyWorldOfType(this.dimensionTypeId(dimension));
    }

    /**
     * A level's world of a dimension for the content adapter: the ready one, or one still
     * preparing its start region, whose generated mobs read the world as they spawn.
     *
     * @param dimension - As {@link WorldManager.getWorldByDimension} takes it.
     * @param level - As {@link WorldManager.getWorldByDimension} takes it.
     */
    public getContentWorldByDimension(dimension: string, level?: string): World | undefined {
        return this.levelOf(level)?.builtWorldOfType(this.dimensionTypeId(dimension));
    }

    /** The dimension type id a dimension name means, a vanilla Bedrock spelling resolved once. */
    private dimensionTypeId(dimension: string): string {
        let wanted = this.dimensionIds.get(dimension);
        if (wanted === undefined) {
            wanted = dimensionByName(dimension)?.id ?? dimension;
            this.dimensionIds.set(dimension, wanted);
        }
        return wanted;
    }

    /** A level by folder name, or the entry level when none is named. */
    private levelOf(level: string | undefined): Level | undefined {
        return level === undefined ? this.entryLevel : this.getLevel(level);
    }

    /**
     * The entry level's world of a dimension, built and enabled if it is not yet.
     *
     * @param dimension - A Java `dimension_type` id, or the Bedrock spelling of a vanilla one.
     * @throws {Error} When no stem of the entry level has that dimension, naming the ones
     *   that do, or when the stem's generator cannot be built.
     */
    public async worldFor(dimension: string): Promise<World> {
        const level = this.getEntryLevel();
        const stemId = this.stemIdOf(level, dimension);
        if (stemId === undefined) {
            throw new PrismarineWorldErrors.UnknownLevelDimension({
                name: level.name,
                dimensionId: dimension,
                stems: [...level.getStems().keys()].join(', ')
            });
        }
        return level.world(stemId);
    }

    /**
     * A level's world of a dimension, the entry level's unless another is named, starting its
     * build when nobody has entered it.
     *
     * For a caller that cannot wait, such as a command writing blocks. The world answered may
     * still be enabling, in which case it has no chunks loaded and a block read finds nothing,
     * the way Java answers "That position is not loaded" for a dimension nobody is in. A caller
     * that used to fall back to the default world here wrote the Nether's blocks into the
     * Overworld instead.
     *
     * @param dimension - A Java `dimension_type` id, or the Bedrock spelling of a vanilla one.
     * @param levelName - The level's folder name, or undefined for the entry level.
     * @returns The world, or undefined when no stem of that level has that dimension, or no
     *   level has that name.
     */
    public startWorld(dimension: string, levelName?: string): World | undefined {
        const ready = this.getWorldByDimension(dimension, levelName);
        if (ready !== undefined) return ready;

        const level = this.levelOf(levelName);
        if (level === undefined) return undefined;
        const stemId = this.stemIdOf(level, dimension);
        if (stemId === undefined) return undefined;

        // Built outside every tick, so a command run inside one does not load the world's chunks
        // into it. `Level.world` records the world before its first await, so it can be answered now.
        void level.prepareWorld(stemId);
        return level.loadedWorld(stemId);
    }

    /**
     * A level's stem of a dimension, the entry level's unless another is named, without
     * building its world.
     *
     * @param dimension - A Java `dimension_type` id, or the Bedrock spelling of a vanilla one.
     * @param levelName - The level's folder name, or undefined for the entry level.
     * @returns The level and the stem's id, or undefined when no stem of the entry level has
     *   that dimension, or no entry level is loaded yet.
     */
    public stemFor(
        dimension: string,
        levelName?: string
    ): { readonly level: Level; readonly stemId: string } | undefined {
        // Unset until `enable` loads it, and a command can run before that.
        const level = this.levelOf(levelName);
        if (level === undefined) return undefined;
        const stemId = this.stemIdOf(level, dimension);
        return stemId === undefined ? undefined : { level, stemId };
    }

    /** A stem by its id first, which is how the vanilla three are named, then by the type it binds. */
    private stemIdOf(level: Level, dimension: string): string | undefined {
        const wanted = dimensionByName(dimension)?.id ?? dimension;
        const stems = level.getStems();
        if (stems.has(wanted)) return wanted;
        for (const [id, stem] of stems) {
            if (stem.type === wanted) return id;
        }
        return undefined;
    }

    /**
     * The entry level's Overworld, which a joining player enters first.
     */
    public getEntryWorld(): World {
        return this.entryWorld;
    }

    /** The generator kinds this server can build a dimension with. */
    public getGeneratorFactories(): GeneratorFactories {
        return this.worldgen.factories;
    }
}
