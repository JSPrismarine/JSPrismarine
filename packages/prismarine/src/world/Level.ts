/**
 * One `worlds.<name>` entry: a folder, a seed and a set of dimensions.
 *
 * Bedrock keeps one save per level, and in it one clock, one set of game rules, one weather,
 * one spawn and one record per player, with every dimension's chunks side by side in one
 * database. {@link Level} owns those, and builds one {@link World} per level stem to own what
 * is per dimension: the chunks, the entities, the block systems and the players standing in
 * it. A `World` reaches its clock, rules and seed through its level, so the code that asks a
 * world for them did not have to move.
 *
 * A world is built when first asked for, unless its stem is marked `eager`, in which case
 * {@link Level.enable} builds it. Building means asking the {@link GeneratorFactories} for the
 * stem's generator and enabling the world. An eager world generates its start region as it
 * enables; a lazy one, built from inside a server tick, leaves its first chunks to whoever
 * arrives.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { Vector3 } from '@jsprismarine/math';
import { Generator as GeneratorType } from '@jsprismarine/minecraft';
import type { DimensionDefinitionFields } from '@jsprismarine/protocol';
import UUID from '@jsprismarine/protocol/structure/UUID';
import type { DimensionTypeDefinition, LevelStem } from '@jsprismarine/worldgen';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';

import type Server from '../Server';
import { replayInputFingerprint, serializeReplayInitialStateManifest } from '../network/ReplayManifest';
import type { ReplayInitialStateManifest } from '../network/ReplayManifest';
import type { WorldConfig, WorldPlayerData } from '../config/JsonConfigTypes';
import { readJsonFile } from '../config/JsonFile';
import { Dimensions, FIRST_CUSTOM_DIMENSION_ID, dimensionTypeOf } from './DimensionType';
import type { DimensionType } from './DimensionType';
import GameRuleManager, { GameRules } from './GameRuleManager';
import type { GeneratorFactories, TerrainCacheSettings } from './GeneratorFactories';
import type { JavaWorldgenRegistries } from './generators/datadriven/javaWorldgenData';
import { requireJavaWorldgenRegistries } from './generators/datadriven/javaWorldgenData';
import type BaseProvider from './providers/BaseProvider';
import { WorldWeather } from './Weather';
import { World } from './World';
import { PlayerPersistence } from './PlayerPersistence';
import { LevelSave } from './LevelSave';
import { profileSpanStarter } from '../profiling/ServerProfiler';
import type { LevelDataAtCut } from './LevelSave';
import { RespawnSearch } from './RespawnSearch';
import { outsideTick } from './TickContext';
import type { WorldData } from './World';
import { byRuntimeId } from './runtimeIdOrder';
import type { RaidRecord } from './raid/RaidManager';
import type { DragonFightState, LegacyWorldEntity, SavedRaid, WorldPersistenceData } from './WorldPersistence';
import { isFlatGenerator, isNoiseGenerator, legacyWorldPersistenceDataOf } from './WorldPersistence';

/** What older versions wrote beside the save before the provider kept the level's state. */
const LEGACY_LEVEL_DATA_FILE_NAME = 'level.json';

/** Where a player record goes when the provider has no player storage of its own. */
/** The biome a custom dimension is announced with when its stem names none. */
const DEFAULT_ANNOUNCED_BIOME = 'minecraft:plains';

/** The `dimension_type` attribute that says where the clouds render. */
const CLOUD_HEIGHT_ATTRIBUTE = 'minecraft:visual/cloud_height';

/** When a stem's world is built: at {@link Level.enable}, or on the first {@link Level.world}. */
export type DimensionLoad = 'eager' | 'lazy';

/**
 * The handlers a level's worlds run, built per world by whoever owns the content.
 *
 * A world's random tick, scheduled tick and redstone handlers are closures over the world they
 * run in, and the world does not exist until the level builds it. The level calls this with a
 * thunk that answers the world once it is built, which is how `WorldManager` has always built
 * them.
 */
export type WorldHandlersFactory = (
    world: () => World | undefined,
    dimension: DimensionType
) => Pick<WorldData, 'randomTickHandlers' | 'blockTickHandlers' | 'redstoneUpdateHandlers'>;

/** How a {@link Level} is built. */
export interface LevelOptions {
    /** The folder name under `worlds/`, which is also the `worlds.<name>` key. */
    readonly name: string;
    /** The level folder, where the legacy `level.json` and the fallback player records live. */
    readonly path: string;
    /** The server the level belongs to. The level reads its content and logger and hands it to each world it builds. */
    readonly server: Server;
    /** The one provider for every dimension of this save. The level opens and closes it. */
    readonly provider: BaseProvider;
    /** The world seed, as a 64-bit value. See {@link import('../utils/Seed').worldSeedOf}. */
    readonly seed: bigint;
    /**
     * The resolved level stems, keyed by dimension id such as `minecraft:the_nether`, in the
     * order a custom type gets its Bedrock id. Has to carry `minecraft:overworld`.
     */
    readonly stems: ReadonlyMap<string, LevelStem>;
    /**
     * The Java `dimension_type` definitions the stems may name, keyed by type id. The level
     * resolves each one a stem uses into a {@link DimensionType}, handing out Bedrock ids from
     * {@link FIRST_CUSTOM_DIMENSION_ID} to the types the overlay does not list.
     */
    readonly dimensionTypes: ReadonlyMap<string, DimensionTypeDefinition>;
    /** When each stem's world is built, by dimension id. A stem left out is `lazy`. */
    readonly load?: ReadonlyMap<string, DimensionLoad>;
    /** The generator kinds this server can build a stem with. */
    readonly factories: GeneratorFactories;
    /**
     * Java's world generation registries, read when a stem's factory asks for them. Defaults to
     * the Java data cache on disk, which a flat or void level never touches.
     */
    readonly worldgen?: () => JavaWorldgenRegistries;
    /** The chunk worker limit from server configuration, forwarded to generator factories. */
    readonly chunkWorkers?: number;
    /** Where chunk generation workers run, forwarded to generator factories. */
    readonly chunkHost?: 'process' | 'in-process';
    /** The terrain tile cache from server configuration, forwarded to generator factories. */
    readonly terrainCache?: TerrainCacheSettings;
    /** The `worlds.<name>` entry as configured, which a provider may read when generating. */
    readonly config?: WorldConfig;
    /** The handlers each world runs; see {@link WorldHandlersFactory}. */
    readonly handlers?: WorldHandlersFactory;
    /**
     * Called with each world the level builds, before the world is enabled. Where the owner
     * registers the world and attaches what the world must not build itself, such as its
     * change sink.
     */
    readonly onWorldBuilt?: (world: World) => void;
}

/** A world the level has built, and the enabling that may still be running. */
interface BuiltWorld {
    readonly world: World;
    /** Resolves once the world has enabled; rejects, and the entry is dropped, when it failed. */
    readonly ready: Promise<void>;
    /** Set once `ready` has resolved. Only a ready world ticks, saves and is listed. */
    isReady: boolean;
}

/**
 * One save: a seed, a provider, a dimension set, and the state Bedrock keeps once per level.
 *
 * {@link Level.enable} opens the provider and reads the saved state; {@link Level.world} builds
 * a dimension's world when it is first asked for; {@link Level.update} advances the clock once
 * per server tick and ticks every loaded world; {@link Level.disable} saves and closes.
 */
export class Level {
    /** The folder name under `worlds/`, which is also the `worlds.<name>` key. */
    public readonly name: string;

    /** The seed every generated chunk, structure placement and carver in this level comes from. */
    public readonly seed: bigint;

    private readonly path: string;
    private readonly server: Server;
    private readonly provider: BaseProvider;
    private readonly playerPersistence: PlayerPersistence;
    /** When and how the level is written to disk; see {@link LevelSave}. */
    private readonly saves: LevelSave;
    private readonly respawnSearch: RespawnSearch;
    private readonly stems: ReadonlyMap<string, LevelStem>;
    private readonly dimensionTypes: ReadonlyMap<string, DimensionType>;
    private readonly load: ReadonlyMap<string, DimensionLoad>;
    private readonly factories: GeneratorFactories;
    private readonly worldgen: () => JavaWorldgenRegistries;
    private readonly chunkWorkers: number | undefined;
    private readonly chunkHost: 'process' | 'in-process' | undefined;
    private readonly terrainCache: TerrainCacheSettings | undefined;
    private readonly config: WorldConfig;
    private readonly handlers: WorldHandlersFactory | undefined;
    private readonly onWorldBuilt: ((world: World) => void) | undefined;

    /**
     * The level's game rules, built before anything can ask for them: a level that exists has
     * its rules.
     */
    private readonly gameRuleManager: GameRuleManager;
    private currentTick = 0;

    /** The weather cycle, its level events and the five numbers the save keeps. */
    private readonly weather: WorldWeather;

    /** Bedrock's `SpawnX/Y/Z`: one spawn per save, in the Overworld. */
    private spawn: Vector3 | null = null;

    /** The dragon fight the save held, handed to the End world's fight when it is created. */
    private storedDragonFight: DragonFightState | undefined;
    private savedRaids: SavedRaid[] = [];

    /** Entity snapshots the save kept outside its chunks, for a provider without actor storage. */
    private legacy: readonly LegacyWorldEntity[] = [];

    /** The worlds built so far, by dimension id, in build order. */
    private readonly built = new Map<string, BuiltWorld>();
    /** Ready worlds by dimension type id, because every block read asks; cleared when `built` changes. */
    private readonly readyByType = new Map<string, World>();

    /** The provider open and the saved state read, or undefined before {@link Level.enable}. */
    private opened: Promise<void> | undefined;

    /** Set the moment a shutdown begins, which stops the tick. */
    private closing = false;

    /** Set once the provider has gone, after which there is nothing left to read or write. */
    private closed = false;

    /**
     * @throws {Error} When the stems have no `minecraft:overworld`, a stem names a dimension
     *   type that `dimensionTypes` does not carry, or two stems bind one type.
     */
    public constructor(options: LevelOptions) {
        this.name = options.name;
        this.path = options.path;
        this.server = options.server;
        this.provider = options.provider;
        this.saves = new LevelSave({
            name: options.name,
            provider: () => this.provider,
            logger: () => this.server.getLogger(),
            levelData: () => this.levelDataNow(),
            savePlayers: async (records, requireSuccess) => this.playerPersistence.saveAll(records, requireSuccess)
        });
        this.playerPersistence = new PlayerPersistence({
            levelName: options.name,
            folder: options.path,
            provider: options.provider,
            logger: () => this.server.getLogger(),
            isClosed: () => this.closed,
            pendingCommit: () => this.saves.pendingCommit()
        });
        this.respawnSearch = new RespawnSearch({
            hasStem: (stemId) => this.stems.has(stemId),
            world: async (stemId) => this.world(stemId),
            // Ready worlds only: an answer in a world still enabling would wait on its start region.
            built: (stemId) => {
                const world = this.loadedWorld(stemId);
                return world !== undefined && [...this.worlds()].includes(world) ? world : undefined;
            },
            worldSpawn: () => this.server.getWorldManager().getDefaultWorld()
        });
        this.seed = options.seed;
        this.stems = options.stems;
        this.load = options.load ?? new Map();
        this.factories = options.factories;
        this.worldgen = options.worldgen ?? requireJavaWorldgenRegistries;
        this.chunkWorkers = options.chunkWorkers;
        this.chunkHost = options.chunkHost;
        this.terrainCache = options.terrainCache;
        this.config = options.config ?? {};
        this.handlers = options.handlers;
        this.onWorldBuilt = options.onWorldBuilt;

        if (!this.stems.has(OVERWORLD_STEM_ID)) {
            throw new Error(
                `Level ${this.name} has no ${OVERWORLD_STEM_ID} stem; Bedrock's spawn and clock live there`
            );
        }
        this.dimensionTypes = Level.resolveDimensionTypes(this.name, this.stems, options.dimensionTypes);

        // A rule set after this point goes out to everyone in every world of the level, the
        // same route the clock takes. The worlds are read when the rule changes, not now, so
        // a world built later hears it too.
        this.gameRuleManager = new GameRuleManager(this.server, (name, value, editable) => {
            for (const world of this.worlds()) {
                world.announceGameRule(name, value, editable);
            }
        });
        this.gameRuleManager.setGameRule(GameRules.ShowCoordinates, true, true);

        // Bedrock renders weather in the Overworld alone, and Java's `isRainingAt` is false
        // under a ceiling, so the level events go to the worlds with a sky.
        this.weather = new WorldWeather({
            cycleAllowed: () => this.gameRuleManager.getGameRule(GameRules.DoWeatherCycle)?.[0] !== false,
            // Read the configured source for every Java weather draw without changing draw points.
            randomInt: (bound) => Math.floor(this.server.getRandom()() * bound),
            broadcast: (event, data) => {
                for (const world of this.worlds()) {
                    if (!world.getDimension().java.hasSkylight) continue;
                    world.sendWorldEvent(null, event, data);
                }
            }
        });
    }

    /**
     * Joins each stem's Java type with its Bedrock overlay, handing out custom ids in stem
     * order.
     *
     * `resolveStems` refuses two stems of one type before a provider opens; this repeats the
     * check for a level built some other way, because two worlds of one type would share a
     * Bedrock id and write over each other's chunks.
     *
     * @throws {Error} When a stem names a type the definitions do not carry, or two stems bind
     *   one type.
     */
    private static resolveDimensionTypes(
        name: string,
        stems: ReadonlyMap<string, LevelStem>,
        definitions: ReadonlyMap<string, DimensionTypeDefinition>
    ): ReadonlyMap<string, DimensionType> {
        const resolved = new Map<string, DimensionType>();
        const boundBy = new Map<string, string>();
        let nextCustomId = FIRST_CUSTOM_DIMENSION_ID;

        for (const [id, stem] of stems) {
            const earlier = boundBy.get(stem.type);
            if (earlier !== undefined) {
                throw new Error(
                    `The ${earlier} and ${id} stems of level ${name} both bind the dimension type ${stem.type}; a type backs one dimension per level`
                );
            }
            boundBy.set(stem.type, id);

            const definition = definitions.get(stem.type);
            if (definition === undefined) {
                throw new Error(
                    `The ${id} stem of level ${name} names the dimension type ${stem.type}, which is not loaded`
                );
            }

            const type = dimensionTypeOf(definition, stem.type, nextCustomId);
            if (type.custom) nextCustomId++;
            resolved.set(stem.type, type);
        }

        return resolved;
    }

    // ------------------------------------------------------------------ the dimension set

    /** The level's folder name, which is what the tick loop and the logs call it. */
    public getName(): string {
        return this.name;
    }

    /** The server this level belongs to. */
    public getServer(): Server {
        return this.server;
    }

    /** The one provider every dimension of this save reads and writes through. */
    public getProvider(): BaseProvider {
        return this.provider;
    }

    /** The resolved level stems by dimension id, in the order the level was given them. */
    public getStems(): ReadonlyMap<string, LevelStem> {
        return this.stems;
    }

    /** The dimension types the stems use, by type id, with their Bedrock ids resolved. */
    public getDimensionTypes(): ReadonlyMap<string, DimensionType> {
        return this.dimensionTypes;
    }

    /** The generator kinds this level builds its stems with. */
    public getGeneratorFactories(): GeneratorFactories {
        return this.factories;
    }

    /**
     * The dimension type a stem binds.
     *
     * @throws {Error} When no stem has that dimension id.
     */
    public dimensionTypeOf(dimensionId: string): DimensionType {
        const stem = this.stemOf(dimensionId);
        const type = this.dimensionTypes.get(stem.type);
        if (type === undefined) throw new Error(`The ${dimensionId} stem of level ${this.name} has no resolved type`);
        return type;
    }

    /**
     * The world of one dimension, built and enabled on first request.
     *
     * The first call for a dimension asks the factories for the stem's generator, builds the
     * world and enables it; every later call answers the same instance once that enabling has
     * finished. Two overlapping first calls share one build. A world whose enabling failed is
     * forgotten, so the call after the failure builds it again rather than answering the same
     * rejection for the life of the level. Only an `eager` stem's world generates its start
     * region here; a lazy one is built from inside a server tick and leaves its first chunks
     * to whoever arrives.
     *
     * @param dimensionId - The stem's key, `minecraft:the_nether` for the Nether. The vanilla
     *   stems share their dimension type's id.
     * @throws {Error} Before {@link Level.enable}, when no stem has that id, or when the stem's
     *   generator cannot be built or the world cannot be enabled.
     */
    public async world(dimensionId: string): Promise<World> {
        const existing = this.built.get(dimensionId);
        if (existing !== undefined) {
            await existing.ready;
            return existing.world;
        }

        const opened = this.opened;
        if (opened === undefined)
            throw new Error(`Level ${this.name} is not enabled, so it cannot build ${dimensionId}`);

        const world = this.build(dimensionId);
        const entry: BuiltWorld = {
            world,
            isReady: false,
            ready: opened
                .then(async () => world.enable())
                .then(
                    () => {
                        entry.isReady = true;
                        this.readyByType.clear();
                    },
                    (error: unknown) => {
                        if (this.built.get(dimensionId) === entry) this.built.delete(dimensionId);
                        this.readyByType.clear();
                        throw error;
                    }
                )
        };
        this.built.set(dimensionId, entry);

        await entry.ready;
        return world;
    }

    /**
     * The world of one dimension if the level has built it, whether or not its enabling has
     * finished; undefined otherwise. Nothing is built.
     *
     * The one accessor that answers a world mid-enable, which is how `WorldManager` names the
     * default world while its start region generates. {@link Level.worlds} lists ready worlds
     * only.
     */
    public loadedWorld(dimensionId: string): World | undefined {
        return this.built.get(dimensionId)?.world;
    }

    /**
     * The world of one dimension once its enabling has finished, or undefined. Nothing is built.
     *
     * What a tick reads when it needs another dimension: a tick never waits for a build, so it
     * asks {@link Level.prepareWorld} for one and reads this again at a later input step.
     */
    public readyWorld(dimensionId: string): World | undefined {
        const entry = this.built.get(dimensionId);
        return entry?.isReady === true ? entry.world : undefined;
    }

    /**
     * Starts building the world of one dimension outside every tick, so a tick that needs it does
     * not wait, and whatever the build loads waits for an input step. A world built or building
     * already is left alone. A failed build is logged, and the next call starts it again.
     *
     * @param dimensionId - The stem's key.
     * @returns The build, which settles once the world is ready or the build failed.
     */
    public prepareWorld(dimensionId: string): Promise<void> {
        return outsideTick(async () => {
            try {
                await this.world(dimensionId);
            } catch (error: unknown) {
                this.server.getLogger().error(`Failed to build the ${dimensionId} dimension of level ${this.name}`);
                this.server.getLogger().error(error);
            }
        });
    }

    /**
     * Every world whose enabling has finished, in build order.
     *
     * A world still enabling is left out: it has no players, it must not tick before its start
     * region is settled, and `WorldManager.getWorldByDimension` promises loaded worlds only.
     */
    public *worlds(): IterableIterator<World> {
        for (const entry of this.built.values()) {
            if (entry.isReady) yield entry.world;
        }
    }

    /**
     * The ready world whose dimension type has this id, or undefined.
     *
     * {@link Level.worlds} filtered by type, without the iterator: the content adapter asks on
     * every block it reads, which made the lookup one of the busier calls of a tick.
     */
    public readyWorldOfType(typeId: string): World | undefined {
        const cached = this.readyByType.get(typeId);
        if (cached !== undefined) return cached;

        for (const entry of this.built.values()) {
            if (entry.isReady && entry.world.getDimension().id === typeId) {
                this.readyByType.set(typeId, entry.world);
                return entry.world;
            }
        }
        return undefined;
    }

    /** Every world built so far, ready or not, which is what a shutdown has to close. */
    private *builtWorlds(): IterableIterator<World> {
        for (const entry of this.built.values()) yield entry.world;
    }

    /**
     * The built world of a Bedrock dimension id, ready or not, or undefined when none is.
     *
     * Ready or not, because the provider asks for a chunk's entities while writing it, and a
     * shutdown mid-preload saves the chunks of a world that never finished enabling.
     */
    private worldOfBedrockId(bedrockId: number): World | undefined {
        for (const world of this.builtWorlds()) {
            if (world.getDimension().bedrockId === bedrockId) return world;
        }
        return undefined;
    }

    /**
     * @throws {Error} When no stem has that dimension id, naming the ones that exist.
     */
    private stemOf(dimensionId: string): LevelStem {
        const stem = this.stems.get(dimensionId);
        if (stem === undefined) {
            throw new Error(
                `Level ${this.name} has no ${dimensionId} dimension. It has: ${[...this.stems.keys()].join(', ')}`
            );
        }
        return stem;
    }

    /** Constructs a dimension's world from its stem, without enabling it. */
    private build(dimensionId: string): World {
        const stem = this.stemOf(dimensionId);
        const dimension = this.dimensionTypeOf(dimensionId);
        const generator = this.factories.build({
            stem,
            dimension,
            seed: this.seed,
            content: () => this.server.getContent(),
            worldgen: this.worldgen,
            ...(this.chunkWorkers === undefined ? {} : { workers: this.chunkWorkers }),
            ...(this.chunkHost === undefined ? {} : { host: this.chunkHost }),
            ...(this.terrainCache === undefined ? {} : { terrainCache: this.terrainCache }),
            logger: this.server.getLogger(),
            completionQueue: this.server.getChunkCompletionQueue()
        });

        // Closed over rather than passed, because a world's handlers are built while the world
        // is being constructed and every one of them runs from its tick long afterwards.
        let built: World | undefined;
        const world = new World({
            name: this.name,
            path: this.path,
            server: this.server,
            level: this,
            stem,
            dimension,
            generator,
            completionQueue: this.server.getChunkCompletionQueue(),
            config: this.config,
            // An eager world is built as the level opens and generates its start region then.
            // A lazy one is built on its first visit, from inside a server tick, where a start
            // region's worth of generation would stall the whole server; whoever arrives loads
            // the chunks they stand in.
            startRegion: this.load.get(dimensionId) === 'eager' ? 'prepared' : 'deferred',
            ...this.handlers?.(() => built, dimension)
        });
        built = world;
        this.onWorldBuilt?.(world);
        return world;
    }

    /**
     * The `DimensionDefinition` of every custom dimension, for `DimensionDataPacket`.
     *
     * A dimension type the Bedrock overlay does not list is one the client has never heard
     * of, so it has to be told the bounds and the id the level chose, from
     * {@link FIRST_CUSTOM_DIMENSION_ID} in stem order. The generator type is `Void`, as
     * Dragonfly sends it: the client generates nothing for a dimension a server feeds it.
     *
     * @returns One entry per custom dimension type, in stem order; empty for a vanilla level.
     */
    public customDimensionDefinitions(): DimensionDefinitionFields[] {
        const definitions: DimensionDefinitionFields[] = [];
        const seen = new Set<string>();

        for (const stem of this.stems.values()) {
            const type = this.dimensionTypes.get(stem.type);
            if (type === undefined || !type.custom || seen.has(type.id)) continue;
            seen.add(type.id);

            const cloudHeight = type.java.attributes.get(CLOUD_HEIGHT_ATTRIBUTE);
            definitions.push({
                minimumY: type.minY,
                heightRange: type.height,
                generatorType: GeneratorType.VOID,
                dimensionType: type.bedrockId,
                // No behavior pack registered it: the stem did, and the client only echoes it.
                packId: new UUID(0n, 0n),
                defaultBiome: Level.announcedBiomeOf(stem),
                cloudHeight: typeof cloudHeight === 'number' ? Math.trunc(cloudHeight) : 0,
                renderClouds: typeof cloudHeight === 'number'
            });
        }

        return definitions;
    }

    /** The one biome a stem's generator names, when it names one. */
    private static announcedBiomeOf(stem: LevelStem): string {
        const generator = stem.generator;
        if (isFlatGenerator(generator)) return generator.settings.biome;
        if (isNoiseGenerator(generator) && generator.biomeSource.type === 'minecraft:fixed') {
            return generator.biomeSource.biome;
        }
        return DEFAULT_ANNOUNCED_BIOME;
    }

    /** Fingerprints resolved level inputs without loading Java registries for flat or void levels. */
    private replayInputFingerprints(): { activeContentFingerprint: string; worldgenFingerprint: string } {
        const stems = [...this.stems];
        const dimensionTypes = [...this.dimensionTypes];
        const usesJavaWorldgen = stems.some(([, stem]) => stem.generator.type === 'minecraft:noise');
        const worldgenRegistries = usesJavaWorldgen ? this.worldgen() : null;
        const worldgenFingerprint = replayInputFingerprint({ stems, dimensionTypes, worldgenRegistries });
        const activeContentFingerprint = replayInputFingerprint({
            content: this.server.getContent().contentFingerprint,
            worldgen: worldgenFingerprint
        });
        return { activeContentFingerprint, worldgenFingerprint };
    }

    /** Digests only the ready worlds' loaded state, leaving unloaded provider rows outside the boundary. */
    private replayWorldDigests(): readonly (readonly [dimension: string, digest: string])[] {
        return [...this.worlds()]
            .map((world) => [world.getDimension().id, world.replayStateDigest()] as const)
            .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    }

    // ------------------------------------------------------------------ the save-level state

    /** The level's clock, in ticks since it was created. */
    public getTicks(): number {
        return this.currentTick;
    }

    /** Sets the clock, which is what `/time set` does. */
    public setTicks(tick: number): void {
        this.currentTick = tick;
    }

    /** The level's game rules, one set for every world of the save. */
    public getGameRuleManager(): GameRuleManager {
        return this.gameRuleManager;
    }

    /** The level's weather: one cycle for the whole save, rendered where there is a sky. */
    public getWeather(): WorldWeather {
        return this.weather;
    }

    /**
     * Saves and captures the provider-backed initial state for a replay.
     *
     * The provider snapshot includes persisted records for loaded and unloaded chunks. Restore it
     * into a fresh provider before that provider opens, then validate and restore the random state
     * with {@link Level.restoreReplayRandomState}.
     *
     * @throws {Error} When the provider cannot capture replay snapshots or persisted state cannot be saved.
     */
    public async captureReplayInitialState(): Promise<ReplayInitialStateManifest> {
        const capture = this.provider.captureReplaySnapshot;
        if (capture === undefined) {
            throw new Error(`Provider '${this.provider.constructor.name}' cannot capture replay snapshots`);
        }

        // Replay checkpoints cannot accept the ordinary save path's swallowed write failures, the
        // level data's included.
        await this.saves.saveForReplay([...this.worlds()]);
        const snapshot = Buffer.from(capture.call(this.provider));
        const { activeContentFingerprint, worldgenFingerprint } = this.replayInputFingerprints();
        const gameRules = [...this.gameRuleManager.getGameRules()]
            .map(([name, [value, editable]]) => ({ name, value, editable }))
            .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
        const dimensions = [...this.stems].map(([id, stem]) => ({
            id,
            type: stem.type,
            generator: stem.generator.type
        }));

        return {
            format: 'jsprismarine-replay-initial-state',
            version: 2,
            level: {
                name: this.name,
                seed: this.seed.toString(),
                tick: this.currentTick,
                weather: { ...this.weather.saved() },
                gameRules,
                dimensions
            },
            contentFingerprint: this.server.getContent().contentFingerprint,
            worldgenFingerprint,
            activeContentFingerprint,
            randomState: this.server.getReplayRandomState(),
            loadedWorldDigests: this.replayWorldDigests(),
            storageBoundary: {
                provider: this.provider.constructor.name,
                kind: 'provider-snapshot',
                includesUnloadedPersistentState: true,
                captureAtomic: true,
                restoreAtomic: false,
                restoresWorldState: true,
                snapshot: snapshot.toString('base64'),
                snapshotDigest: createHash('sha256').update(snapshot).digest('hex')
            }
        };
    }

    /** Verifies a matching initial boundary and restores only its random streams. */
    public restoreReplayRandomState(manifest: ReplayInitialStateManifest): void {
        serializeReplayInitialStateManifest(manifest);
        const currentInputs = this.replayInputFingerprints();
        const currentGameRules = [...this.gameRuleManager.getGameRules()]
            .map(([name, [value, editable]]) => ({ name, value, editable }))
            .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
        const currentDimensions = [...this.stems].map(([id, stem]) => ({
            id,
            type: stem.type,
            generator: stem.generator.type
        }));

        if (
            manifest.level.name !== this.name ||
            manifest.level.seed !== this.seed.toString() ||
            manifest.level.tick !== this.currentTick ||
            JSON.stringify(manifest.level.weather) !== JSON.stringify(this.weather.saved()) ||
            JSON.stringify(manifest.level.gameRules) !== JSON.stringify(currentGameRules) ||
            JSON.stringify(manifest.level.dimensions) !== JSON.stringify(currentDimensions) ||
            manifest.contentFingerprint !== this.server.getContent().contentFingerprint ||
            manifest.worldgenFingerprint !== currentInputs.worldgenFingerprint ||
            manifest.activeContentFingerprint !== currentInputs.activeContentFingerprint ||
            manifest.storageBoundary.provider !== this.provider.constructor.name ||
            JSON.stringify(manifest.loadedWorldDigests) !== JSON.stringify(this.replayWorldDigests())
        ) {
            throw new Error("Replay manifest does not match this level's current initial state");
        }

        this.server.restoreReplayRandomState(manifest.randomState);
    }

    /**
     * The world spawn if it is known, and null while it is not.
     *
     * Bedrock's `SpawnX/Y/Z` is one point per save and it is in the Overworld, so the Overworld
     * world searches for it and every world reads it from here.
     */
    public getSpawn(): Vector3 | null {
        return this.spawn;
    }

    /** Sets the world spawn; see {@link Level.getSpawn}. */
    public setSpawn(at: Vector3): void {
        this.spawn = at;
    }

    /** Whether {@link Level.disable} has closed the provider, after which nothing can be read or written. */
    public isClosed(): boolean {
        return this.closed;
    }

    /**
     * Entity snapshots the save kept outside its chunks, which a provider without actor
     * storage wrote for the Overworld. Empty once a chunk-storing provider owns the save.
     */
    public legacyEntities(): readonly LegacyWorldEntity[] {
        return this.legacy;
    }

    // ------------------------------------------------------------------ lifecycle

    /**
     * Opens the provider, reads the saved state and builds the eager worlds.
     *
     * The eager worlds are constructed before the first `await`, so a caller that starts this
     * and needs one of them at once, as `WorldManager` needs the default world, finds it
     * through {@link Level.loadedWorld} while the provider is still opening.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        this.provider.setLevel(this);
        this.provider.setEntitySource((dimension) => this.worldOfBedrockId(dimension.bedrockId)?.actors() ?? []);
        this.opened = this.open();

        const eager: Promise<World>[] = [];
        for (const id of this.stems.keys()) {
            if (this.load.get(id) === 'eager') eager.push(this.world(id));
        }

        await this.opened;
        await Promise.all(eager);
    }

    /** Opens the provider and puts back what the save held. */
    private async open(): Promise<void> {
        await this.provider.enable();

        const legacy = await this.readLegacyLevelData();
        if (legacy !== null) {
            await this.provider.migrateLegacyWorldData(legacy);

            try {
                await fs.promises.unlink(path.join(this.path, LEGACY_LEVEL_DATA_FILE_NAME));
            } catch (error: unknown) {
                this.server.getLogger().error(`Failed to remove migrated level data for ${this.name}`);
                this.server.getLogger().error(error);
            }
        }

        const stored = (await this.provider.readWorldData()) ?? {};
        if (stored.spawn) this.spawn = Vector3.fromObject(stored.spawn);
        this.weather.restore(stored.weather);
        for (const [name, [value, editable]] of stored.gameRules ?? []) {
            this.gameRuleManager.setGameRule(name, value, editable);
        }
        if (stored.entities && this.provider.supportsChunkUnload !== true) this.legacy = stored.entities;
        this.storedDragonFight = stored.dragonFight;
        this.savedRaids = stored.raids ?? [];

        // The clock is written to `level.dat` alone, so it is read back from there; without it
        // every boot started the day over at tick zero.
        const time = this.provider.readLevelData()?.time;
        if (time !== undefined) this.currentTick = time;
    }

    private async readLegacyLevelData(): Promise<WorldPersistenceData | null> {
        const file = path.join(this.path, LEGACY_LEVEL_DATA_FILE_NAME);
        if (!fs.existsSync(file)) return null;

        try {
            const data: unknown = (await readJsonFile(file, '{}')).get([]);
            return legacyWorldPersistenceDataOf(data);
        } catch (error: unknown) {
            // Keep an unreadable legacy file so a later startup can retry the migration.
            this.server.getLogger().error(`Failed to read legacy world data for ${this.name}`);
            this.server.getLogger().error(error);
            return null;
        }
    }

    /**
     * One server tick: the clock advances once, the weather cycle runs, and every loaded world
     * updates against the new tick.
     *
     * The weather goes before the worlds for the reason `ServerLevel.tick` runs
     * `advanceWeatherCycle` before its tick lists: a fire scheduled this tick should be put out
     * by rain that started this tick.
     *
     * The worlds tick one after another in stem order, as `MinecraftServer.tickChildren` walks
     * its levels, rather than interleaved. An entity that leaves one world for another during
     * its update is then in exactly one world's roster at any point of the tick; a world
     * ticked later skips an arrival that was already ticked this tick.
     *
     * A world whose update throws is logged with its name, and the worlds after it still tick.
     * One broken dimension then costs that dimension its tick and never another's.
     *
     * @param tick - The server's tick counter, which the worlds pace their own work by.
     */
    public update(tick: number): undefined {
        if (this.closing) return;

        this.currentTick++;
        this.weather.tick(this.currentTick);
        const worlds = this.worldsInStemOrder();
        for (const world of worlds) {
            try {
                world.update(tick);
            } catch (error: unknown) {
                this.server.getLogger().error(`World ${world.getName()} of ${this.name} failed tick ${tick}`);
                this.server.getLogger().error(error);
            }
        }

        // After every world, so an autosave's cut is the state at the end of this tick in each
        // dimension (ADR 0018).
        const endSaveProfile = profileSpanStarter(this.server)?.(`Level.save:${this.name}`);
        try {
            this.saves.tick(this.currentTick, worlds);
        } finally {
            endSaveProfile?.();
        }
    }

    /**
     * Opens this tick of every ready world's change log, before the input step, so the inputs
     * it applies land in the tick that applied them.
     */
    public beginChangeTick(): void {
        for (const world of this.worldsInStemOrder()) world.beginChangeTick();
    }

    /**
     * Closes the tick of every world whose change log tick is still open, for a level the ticker
     * did not update, such as a frozen one. A world that throws is logged, and the worlds after
     * it still close theirs.
     *
     * @param tick - The server tick.
     */
    public closeTick(tick: number): undefined {
        for (const world of this.worlds()) {
            try {
                world.closeTick(tick);
            } catch (error: unknown) {
                this.server.getLogger().error(`World ${world.getName()} of ${this.name} failed to close tick ${tick}`);
                this.server.getLogger().error(error);
            }
        }
    }

    /** The ready worlds in stem order, which is the order the level ticks them in. */
    private worldsInStemOrder(): World[] {
        const worlds: World[] = [];
        for (const id of this.stems.keys()) {
            const entry = this.built.get(id);
            if (entry?.isReady) worlds.push(entry.world);
        }
        return worlds;
    }

    /**
     * Writes the whole level in one pass: every loaded world's players and chunks, and the level
     * data. See {@link LevelSave.save}.
     */
    public async save(): Promise<void> {
        await this.saves.save([...this.worlds()]);
    }

    /**
     * Writes some of the level's worlds in one pass, with the level data: their players and
     * changed chunks. A world asks for this to save itself.
     * @param worlds - The worlds, ready or not.
     */
    public async saveWorlds(worlds: readonly World[]): Promise<void> {
        await this.saves.save(worlds);
    }

    /**
     * Settles once the pass whose cut is taken has committed, or at once when none is pending;
     * see {@link LevelSave.pendingCommit}.
     */
    public async pendingSave(): Promise<void> {
        await this.saves.pendingCommit();
    }

    /**
     * Writes the level's own state through the provider: the spawn, rules, weather and stems
     * into the provider's record, and the spawn, clock, generator and Nether scale into
     * `level.dat`. Queued behind a pass that is running; see {@link LevelSave.saveLevelData}.
     *
     * A level whose spawn is still unknown writes everything else and leaves the stored spawn
     * where it is. Overwriting a real spawn point with a guess would be worse than the gap.
     */
    public async saveLevelData(): Promise<void> {
        try {
            await this.saves.saveLevelData();
        } catch (error: unknown) {
            this.server.getLogger().error(`Failed to save level data for ${this.name}`);
            this.server.getLogger().error(error);
        }
    }

    /**
     * The level's own state as it is now, for a save pass's cut: the record the provider keeps
     * and what goes into `level.dat`. The provider merges the record over the one it holds, so a
     * field left out keeps what the save already has.
     */
    private levelDataNow(): LevelDataAtCut {
        const spawn = this.spawn;
        if (spawn === null) {
            this.server.getLogger().debug(`No spawn point to save for ${this.name}`, 'Level/saveLevelData');
        }

        const stems = Object.fromEntries(this.stems);
        const dragonFight = this.dragonFightState();
        const raids = this.raidState();
        const position = spawn ? { x: spawn.getX(), y: spawn.getY(), z: spawn.getZ() } : undefined;
        return {
            record: {
                ...(position === undefined ? {} : { spawn: position }),
                gameRules: Array.from(this.gameRuleManager.getGameRules()),
                weather: this.weather.saved(),
                ...(this.provider.supportsChunkUnload === true ? {} : { entities: this.entitySnapshots() }),
                worldGenSettings: { seed: this.seed.toString(), dimensions: stems },
                ...(dragonFight === undefined ? {} : { dragonFight }),
                ...(raids === undefined ? {} : { raids })
            },
            levelDat: {
                ...(position === undefined ? {} : { spawn: position }),
                time: this.currentTick,
                stems,
                netherScale: this.netherScale()
            }
        };
    }

    /** The raids the save held, which the Overworld's raid manager starts from. */
    public storedRaids(): RaidRecord[] {
        return this.savedRaids;
    }

    /**
     * The live raids to save. A world that ran none keeps what the save held, so a raid is not
     * forgotten because the world holding it never woke.
     */
    private raidState(): SavedRaid[] | undefined {
        for (const world of this.worlds()) {
            const records = world.raidSaveState();
            if (records !== undefined) return records;
        }
        return this.savedRaids.length === 0 ? undefined : this.savedRaids;
    }

    /** The dragon fight the save held, which the End world's fight starts from. */
    public storedDragonFightState(): DragonFightState | undefined {
        return this.storedDragonFight;
    }

    /**
     * The live fight state to save, from whichever loaded world runs one.
     *
     * A level has at most one fight: Java creates one per level, in the dimension whose type
     * sets `has_ender_dragon_fight`. A world whose fight never ran answers undefined and the
     * save keeps what it already held.
     */
    private dragonFightState(): DragonFightState | undefined {
        for (const world of this.worlds()) {
            const state = world.dragonFightSaveState();
            if (state !== undefined) return state;
        }
        return undefined;
    }

    /** The Nether's `coordinate_scale`, from its stem's type; Java's 8 for a level without one. */
    private netherScale(): number {
        const nether = this.stems.get(Dimensions.Nether.id);
        const type = nether === undefined ? undefined : this.dimensionTypes.get(nether.type);
        return (type ?? Dimensions.Nether).java.coordinateScale;
    }

    /**
     * Every non-player entity of every loaded world, for a provider without actor storage, each
     * world's in ascending runtime id order.
     */
    private entitySnapshots(): LegacyWorldEntity[] {
        return [...this.worlds()].flatMap((world) =>
            world
                .actors()
                .filter((entity) => world.viewerOf(entity.getRuntimeId()) === undefined)
                .toArray()
                .sort(byRuntimeId)
                .map((entity) => ({
                    type: entity.getType(),
                    position: {
                        x: entity.getPosition().getX(),
                        y: entity.getPosition().getY(),
                        z: entity.getPosition().getZ(),
                        pitch: entity.pitch,
                        yaw: entity.yaw,
                        headYaw: entity.headYaw
                    }
                }))
        );
    }

    /**
     * Saves and closes: every world stops and writes itself, the level data goes out once
     * more, and the provider is closed last, once nothing is left that could ask it for
     * anything.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        this.closing = true;

        // Every built world, ready or not: a shutdown during a start region's generation is the
        // ordinary case, and `World.stop` is what stops that generation. Then one pass writes
        // them all, with the level data.
        const worlds = [...this.builtWorlds()];
        await Promise.all(worlds.map(async (world) => world.stop()));
        try {
            await this.saves.save(worlds);
        } catch (error: unknown) {
            this.server.getLogger().error(`Failed to save level ${this.name}`);
            this.server.getLogger().error(error);
        }
        await this.provider.disable();
        this.closed = true;
    }

    // ------------------------------------------------------------------ player records

    /** Where this level's players come back after a death; see {@link RespawnSearch}. */
    public getRespawnSearch(): RespawnSearch {
        return this.respawnSearch;
    }

    /** Where this level's player records are read and written; see {@link PlayerPersistence}. */
    public getPlayerPersistence(): PlayerPersistence {
        return this.playerPersistence;
    }

    /**
     * The record for one player, from the provider's player storage or the fallback JSON file.
     *
     * @param key - What the record is filed under; see `playerKeyOf`.
     * @returns The record, or null when this save has none for the key.
     */
    public async getPlayerData(key: string): Promise<Partial<WorldPlayerData> | null> {
        return this.playerPersistence.load(key);
    }

    /**
     * Writes one player's record; see {@link PlayerPersistence.save}.
     *
     * @param requireSuccess - Propagate a persistence error when creating a replay checkpoint.
     */
    public async savePlayerData(key: string, data: WorldPlayerData, requireSuccess = false): Promise<void> {
        await this.playerPersistence.save(key, data, requireSuccess);
    }
}
