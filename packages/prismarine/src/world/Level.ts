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
import UUID from '@jsprismarine/protocol/bedrock/structure/UUID';
import type { DimensionTypeDefinition, LevelStem } from '@jsprismarine/worldgen';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';

import type Server from '../Server';
import { replayInputFingerprint, serializeReplayInitialStateManifest } from '../network/ReplayManifest';
import type { ReplayInitialStateManifest } from '../network/ReplayManifest';
import type { WorldConfig, WorldPlayerData } from '../config/JsonConfigTypes';
import { readJsonFile } from '../config/JsonFile';
import { Dimensions, dimensionTypeOf, isCustomDimensionType } from './DimensionType';
import { DimensionNumbers } from './DimensionNumbers';
import type { SavedDimensionNumbers } from './DimensionNumbers';
import { voidStem } from './generators/factories/void';
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
import { assertJavaDataVersionOpens } from './javaDataVersion';
import { DEFAULT_JAVA_DATA_TARGET } from '@jsprismarine/packs/javaDataTarget';
import type { JavaDataTarget } from '@jsprismarine/packs/javaDataTarget';
import { RespawnSearch } from './RespawnSearch';
import { outsideTick } from './TickContext';
import type { WorldData } from './World';
import { byRuntimeId } from './runtimeIdOrder';
import type { RaidRecord } from './raid/RaidManager';
import type {
    DragonFightState,
    LegacyWorldEntity,
    SavedRaid,
    StructureReference,
    WorldPersistenceData
} from './WorldPersistence';
import {
    isFlatGenerator,
    isNoiseGenerator,
    legacyWorldPersistenceDataOf,
    structureReferenceKey
} from './WorldPersistence';
import { PrismarineWorldErrors } from '@jsprismarine/errors/prismarine/world';
import type { WorldExperiment } from './WorldExperiments';
import { levelExperiments } from './WorldExperiments';
import { LevelDynamicProperties } from './dynamicProperties';
import { LevelScriptSettings } from './LevelScriptSettings';
import type { TickingArea } from './TickingAreas';
import { TickingAreas } from './TickingAreas';
import { CommandStorage } from './CommandStorage';
import { newSavedMap } from './savedMap';
import type { NewSavedMap, SavedMap } from './savedMap';
import { Scoreboard } from './Scoreboard';
import GameRuleChangedEvent from '../events/other/GameRuleChangedEvent';
import { ADVANCE_TIME, gameRuleValue } from '../content/world/gameRules';
import { LevelClock } from './LevelClock';

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
    /** The level's UUID: the one its save holds, or a new one for a save that has none yet. */
    readonly id: string;
    /** The folder name under `worlds/`, which is also the `worlds.<name>` key. */
    readonly name: string;
    /** The level folder, where the legacy `level.json` and the fallback player records live. */
    readonly path: string;
    /** The server the level belongs to. The level reads its content and logger and hands it to each world it builds. */
    readonly server: Server;
    /** The one provider for every dimension of this save. The level opens and closes it. */
    readonly provider: BaseProvider;
    /** The world seed, as a 64-bit value. See `worldSeedOf`. */
    readonly seed: bigint;
    /**
     * The resolved level stems, keyed by dimension id such as `minecraft:the_nether`, in the
     * order a custom type gets its Bedrock id. Has to carry `minecraft:overworld`.
     */
    readonly stems: ReadonlyMap<string, LevelStem>;
    /**
     * The Java `dimension_type` definitions the stems may name, keyed by type id. The level
     * resolves each one a stem uses into a {@link DimensionType}, giving each type the overlay does
     * not list the Bedrock number the save keeps for it; see {@link DimensionNumbers}.
     */
    readonly dimensionTypes: ReadonlyMap<string, DimensionTypeDefinition>;
    /** When each stem's world is built, by dimension id. A stem left out is `lazy`. */
    readonly load?: ReadonlyMap<string, DimensionLoad>;
    /** The custom dimension numbers the save keeps, or undefined for a save from before it kept them. */
    readonly dimensionNumbers?: SavedDimensionNumbers;
    /** The generator kinds this server can build a stem with. */
    readonly factories: GeneratorFactories;
    /**
     * The Java release the server's content was loaded for. Its data version is recorded in
     * `level.dat`, and a save recording a newer one refuses to open. Defaults to
     * `DEFAULT_JAVA_DATA_TARGET`.
     */
    readonly javaTarget?: JavaDataTarget;
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
    /**
     * The level's UUID, kept in its save: what the level is, whatever it is named or wherever its
     * folder moves ([ADR 0029](../../../../docs/adr/0029-worlds-are-levels-the-server-manages.md)).
     */
    public readonly id: string;
    /** The folder name under `worlds/`, which is also the `worlds.<name>` key. */
    public readonly name: string;

    /** The seed every generated chunk, structure placement and carver in this level comes from. */
    public readonly seed: bigint;
    /** The Java release the level is opened and saved under; see {@link LevelOptions.javaTarget}. */
    private readonly javaTarget: JavaDataTarget;

    private readonly path: string;
    private readonly server: Server;
    private readonly provider: BaseProvider;
    private readonly playerPersistence: PlayerPersistence;
    /** When and how the level is written to disk; see {@link LevelSave}. */
    private readonly saves: LevelSave;
    private readonly respawnSearch: RespawnSearch;
    /** Every stem: the config's and the save's, then the ones scripts registered, in that order. */
    private readonly stems: Map<string, LevelStem>;
    private readonly dimensionTypes: Map<string, DimensionType>;
    /** The Bedrock number of each custom dimension, which the save keeps; see {@link DimensionNumbers}. */
    private readonly dimensionNumbers: DimensionNumbers;
    /**
     * The stems scripts registered, which the save leaves out: the scripts register them again
     * each time the level opens, and their types are in no datapack the next start reads.
     */
    private readonly scriptStems = new Set<string>();
    /** The script dimensions added since the last {@link Level.settleScriptDimensions}. */
    private readonly addedScriptStems = new Set<string>();
    /** The worlds of script dimensions a reload dropped, by type id, until they have saved and closed. */
    private readonly retiring = new Map<string, Promise<void>>();
    private readonly load: ReadonlyMap<string, DimensionLoad>;
    private readonly factories: GeneratorFactories;
    private readonly worldgen: () => JavaWorldgenRegistries;
    private readonly chunkWorkers: number | undefined;
    private readonly chunkHost: 'process' | 'in-process' | undefined;
    private readonly terrainCache: TerrainCacheSettings | undefined;
    private readonly config: WorldConfig;
    private experiments: readonly WorldExperiment[];
    private readonly handlers: WorldHandlersFactory | undefined;
    private readonly onWorldBuilt: ((world: World) => void) | undefined;

    /**
     * The level's game rules, built before anything can ask for them: a level that exists has
     * its rules.
     */
    private readonly gameRuleManager: GameRuleManager;
    private readonly clock = new LevelClock(() => gameRuleValue(this.gameRuleManager, ADVANCE_TIME) !== false);

    /** The weather cycle, its level events and the five numbers the save keeps. */
    private readonly weather: WorldWeather;

    /** Bedrock's `SpawnX/Y/Z`: one spawn per save, in the Overworld. */
    private spawn: Vector3 | null = null;

    /** The scripts' dynamic properties of the level, which BDS calls the world's. */
    private readonly dynamicProperties = new LevelDynamicProperties();

    /** The one scoreboard, which `/scoreboard` and the scripts share. */
    private readonly scoreboard = new Scoreboard();

    /** The NBT compounds `/data … storage` reads and writes. */
    private readonly commandStorage = new CommandStorage();

    /** The last `minecraft:map_id` handed out, Java's `idcounts` entry; -1 before the first. */
    private lastMapId = -1;

    /** Every map made in this level, by `minecraft:map_id`: Java's `map_<id>` saved data. */
    private readonly maps = new Map<number, SavedMap>();

    /**
     * The structure starts an explorer map already points at, by {@link structureReferenceKey}.
     * Java keeps the same count on each `StructureStart` as its `references`.
     */
    private readonly referencedStructures = new Map<string, StructureReference>();

    /** The dragon fight the save held, handed to the End world's fight when it is created. */
    private storedDragonFight: DragonFightState | undefined;
    private savedRaids: SavedRaid[] = [];
    /** What the scripts set on the world that nothing else keeps, saved in the level's record. */
    private readonly scriptSettings = new LevelScriptSettings();
    /** The ticking areas, made once the saved ones can be added; see {@link Level.getTickingAreas}. */
    private tickingAreas: TickingAreas | undefined;
    /** The ticking areas the save held, added when the areas are made. */
    private storedTickingAreas: readonly TickingArea[] = [];

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
        this.id = options.id;
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
            // The level's own Overworld, which every level builds as it opens: a player without a
            // spawn point of their own comes back in the level they died in.
            worldSpawn: () => this.loadedWorld(OVERWORLD_STEM_ID) ?? this.server.getWorldManager().getEntryWorld()
        });
        this.seed = options.seed;
        this.javaTarget = options.javaTarget ?? DEFAULT_JAVA_DATA_TARGET;
        this.stems = new Map(options.stems);
        this.load = options.load ?? new Map();
        this.factories = options.factories;
        this.worldgen = options.worldgen ?? requireJavaWorldgenRegistries;
        this.chunkWorkers = options.chunkWorkers;
        this.chunkHost = options.chunkHost;
        this.terrainCache = options.terrainCache;
        this.config = options.config ?? {};
        this.experiments = levelExperiments(this.config.experiments, undefined);
        this.handlers = options.handlers;
        this.onWorldBuilt = options.onWorldBuilt;

        if (!this.stems.has(OVERWORLD_STEM_ID)) {
            throw new PrismarineWorldErrors.LevelHasNoOverworld({
                name: this.name,
                overworldStemId: OVERWORLD_STEM_ID
            });
        }
        this.dimensionNumbers = new DimensionNumbers(options.dimensionNumbers);
        this.dimensionTypes = new Map(
            Level.resolveDimensionTypes(this.name, this.stems, options.dimensionTypes, this.dimensionNumbers)
        );

        // A rule set after this point goes out to everyone in every world of the level, the
        // same route the clock takes. The worlds are read when the rule changes, not now, so
        // a world built later hears it too.
        this.gameRuleManager = new GameRuleManager(this.server, (name, value, editable) => {
            for (const world of this.worlds()) {
                world.announceGameRule(name, value, editable);
            }
            const { events } = this.server.getKernel();
            if (events.hasListeners('gameRuleChanged'))
                events.post('gameRuleChanged', new GameRuleChangedEvent(this, name, value));
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
        definitions: ReadonlyMap<string, DimensionTypeDefinition>,
        numbers: DimensionNumbers
    ): ReadonlyMap<string, DimensionType> {
        const resolved = new Map<string, DimensionType>();
        const boundBy = new Map<string, string>();

        for (const [id, stem] of stems) {
            const earlier = boundBy.get(stem.type);
            if (earlier !== undefined) {
                throw new PrismarineWorldErrors.DimensionsShareType({
                    earlier,
                    id,
                    name,
                    type: stem.type
                });
            }
            boundBy.set(stem.type, id);

            const definition = definitions.get(stem.type);
            if (definition === undefined) {
                throw new PrismarineWorldErrors.UnknownDimensionType({ id, name, type: stem.type });
            }

            const type = isCustomDimensionType(stem.type)
                ? dimensionTypeOf(definition, stem.type, numbers.numberOf(stem.type))
                : dimensionTypeOf(definition, stem.type);
            resolved.set(stem.type, type);
        }

        return resolved;
    }

    // ------------------------------------------------------------------ the dimension set

    /**
     * Adds a custom dimension a script registered with `StartupEvent.dimensionRegistry`, as BDS
     * makes one: a void dimension with the Overworld's bounds, -64 to 320, as the
     * `custom-dimensions` scenario recorded. Its world is built on its first visit.
     *
     * A dimension the level already has, from the config or an earlier registration, is
     * registered again and keeps its definition: on BDS a pack's `dimension/*.json` takes priority
     * over a script's registration. Unlike BDS, which refuses a dimension that only a reload
     * registers with "Please exit and rejoin your world", the level adds it, and the caller tells
     * the clients already in the level about it.
     *
     * @param typeId - The dimension's namespaced id, which the script host has checked.
     * @returns Whether the level has the dimension now, which it always has.
     */
    public registerScriptDimension(typeId: string): 'registered' {
        if ([...this.stems.values()].some((stem) => stem.type === typeId)) return 'registered';
        this.dimensionTypes.set(
            typeId,
            dimensionTypeOf(Dimensions.Overworld.java, typeId, this.dimensionNumbers.numberOf(typeId))
        );
        this.stems.set(typeId, voidStem(typeId));
        this.scriptStems.add(typeId);
        this.addedScriptStems.add(typeId);
        return 'registered';
    }

    /** Whether a custom dimension got a number the save does not hold yet, which the next save writes. */
    public hasUnsavedDimensionNumbers(): boolean {
        return this.dimensionNumbers.isChanged();
    }

    /**
     * Ends one run's registrations, after its `startup`: the first run's or a reload's. A script
     * dimension this run did not register is dropped, and its world, once built, is saved and
     * closed. One that players are still in stays until a later run drops it while it is empty.
     *
     * @param registered - Every dimension the run registered.
     * @returns The dimensions added since the last call, which clients already in the level have
     * not heard of, the ones dropped, and the ones kept for their players.
     */
    public settleScriptDimensions(registered: readonly string[]): {
        readonly added: readonly string[];
        readonly removed: readonly string[];
        readonly kept: readonly string[];
    } {
        const wanted = new Set(registered);
        const added = [...this.addedScriptStems].filter((typeId) => this.scriptStems.has(typeId));
        this.addedScriptStems.clear();
        const removed: string[] = [];
        const kept: string[] = [];
        for (const typeId of [...this.scriptStems]) {
            if (wanted.has(typeId)) continue;
            const entry = this.built.get(typeId);
            if (entry !== undefined && entry.world.getViewers().length > 0) {
                kept.push(typeId);
                continue;
            }
            this.stems.delete(typeId);
            this.dimensionTypes.delete(typeId);
            this.scriptStems.delete(typeId);
            if (entry !== undefined) this.retiring.set(typeId, this.retire(typeId, entry));
            removed.push(typeId);
        }
        return { added, removed, kept };
    }

    /**
     * Saves and closes the world of a dropped script dimension. It stays among the built worlds
     * until its save has written it, since the save reads each dimension's entities from there.
     */
    private async retire(typeId: string, entry: BuiltWorld): Promise<void> {
        try {
            await entry.world.stop();
            await this.saves.save([entry.world]);
        } catch (error: unknown) {
            this.server.getLogger().error(`Failed to save the ${typeId} dimension of level ${this.name}`);
            this.server.getLogger().error(error);
        } finally {
            if (this.built.get(typeId) === entry) this.built.delete(typeId);
            this.readyByType.clear();
            this.retiring.delete(typeId);
        }
    }

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

    /**
     * The Bedrock experiments the level runs with: the ones its `worlds.<name>` entry lists and the
     * ones its `level.dat` has on, read once the level opens.
     */
    public getExperiments(): readonly WorldExperiment[] {
        return this.experiments;
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
        if (type === undefined)
            throw new PrismarineWorldErrors.UnresolvedDimensionType({ dimensionId, name: this.name });
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
        // A dimension a reload dropped and a later one registered again is built anew once the
        // old world has saved and closed. Only then: the check and the build below run in one
        // step, so two first calls share one build and the world is built the moment it is asked for.
        const retiring = this.retiring.get(dimensionId);
        if (retiring !== undefined) {
            await retiring;
            return this.world(dimensionId);
        }
        const existing = this.built.get(dimensionId);
        if (existing !== undefined) {
            await existing.ready;
            return existing.world;
        }

        const opened = this.opened;
        if (opened === undefined) throw new PrismarineWorldErrors.LevelNotOpened({ name: this.name, dimensionId });

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

    /**
     * The world whose dimension type has this id, ready or still preparing its start region, or
     * undefined. A world generating its start region already holds loaded chunks, and what that
     * generation spawns, such as a village's villagers, reads its biome through the content adapter.
     */
    public builtWorldOfType(typeId: string): World | undefined {
        const ready = this.readyWorldOfType(typeId);
        if (ready !== undefined) return ready;
        for (const entry of this.built.values()) {
            if (entry.world.getDimension().id === typeId) return entry.world;
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
            throw new PrismarineWorldErrors.UnknownLevelDimension({
                name: this.name,
                dimensionId,
                stems: [...this.stems.keys()].join(', ')
            });
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
     * of, so it has to be told the bounds and the number the save keeps for it
     * ({@link DimensionNumbers}). The generator type is `Void`, as
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
        return this.clock.getGameTime();
    }

    /** Sets the game clock. The time of day moves with it. */
    public setTicks(tick: number): void {
        this.clock.setGameTime(tick);
    }

    /**
     * The time of day in ticks, Bedrock's `Time`, which the sun, `/time` and the overworld's
     * script clock read. It runs with {@link getTicks} except while it is held still.
     */
    public getDayTime(): number {
        return this.clock.getDayTime();
    }

    /** Sets the time of day, which is what `/time set` does. The game clock keeps its count. */
    public setDayTime(time: number): void {
        this.clock.setDayTime(time);
    }

    /** Whether a script paused the overworld clock. */
    public isDayTimePaused(): boolean {
        return this.clock.isPaused();
    }

    /** Pauses or resumes the overworld clock, apart from the `minecraft:advance_time` rule. */
    public setDayTimePaused(paused: boolean): void {
        this.clock.setPaused(paused);
    }

    /** What the level's scripts set on the world that nothing else keeps. */
    public getScriptSettings(): LevelScriptSettings {
        return this.scriptSettings;
    }

    /**
     * The level's ticking areas, which the `/tickingarea` command and the scripts share. Made the
     * first time they are asked for, which the level does once it has opened, with the areas the
     * save held. An area's world is started if nobody has entered its dimension yet.
     */
    public getTickingAreas(): TickingAreas {
        if (this.tickingAreas === undefined) {
            const areas = new TickingAreas((dimension) => {
                const stem = [...this.stems.keys()].find((id) => this.dimensionTypeOf(id).bedrockName === dimension);
                if (stem === undefined) return undefined;
                // Built outside every tick, as `WorldManager.startWorld` builds one.
                void this.prepareWorld(stem);
                return this.loadedWorld(stem);
            });
            this.tickingAreas = areas;
            for (const area of this.storedTickingAreas) areas.add(area);
        }
        return this.tickingAreas;
    }

    /** The level's game rules, one set for every world of the save. */
    public getGameRuleManager(): GameRuleManager {
        return this.gameRuleManager;
    }

    /** The scripts' dynamic properties of the level, which its save writes as BDS's `DynamicProperties` record. */
    public getDynamicProperties(): LevelDynamicProperties {
        return this.dynamicProperties;
    }

    /** The level's scoreboard, which its save writes as BDS's `scoreboard` record. */
    public getScoreboard(): Scoreboard {
        return this.scoreboard;
    }

    /** The level's command storage, which its save writes under `jsprismarine:command_storage`. */
    public getCommandStorage(): CommandStorage {
        return this.commandStorage;
    }

    /**
     * A `minecraft:map_id` no map in this level has had, which is Java's `ServerLevel.getFreeMapId`.
     * The counter is saved with the level, so an id is never handed out twice.
     */
    public nextMapId(): number {
        this.lastMapId += 1;
        return this.lastMapId;
    }

    /**
     * Makes a map and answers its id, Java's `MapItem.createNewSavedData`: a fresh id and the
     * map's center, scale, dimension and markers, saved with the level under that id.
     */
    public createMap(request: NewSavedMap): number {
        const id = this.nextMapId();
        this.maps.set(id, newSavedMap(request));
        return id;
    }

    /** The map saved under an id, or undefined for an id this level never made. */
    public getMap(id: number): SavedMap | undefined {
        return this.maps.get(id);
    }

    /** Whether an earlier explorer map search already found this structure start. */
    public isStructureReferenced(start: StructureReference): boolean {
        return this.referencedStructures.has(structureReferenceKey(start));
    }

    /** Marks a structure start as one an explorer map points at, so later searches pass over it. */
    public referenceStructure(start: StructureReference): void {
        this.referencedStructures.set(structureReferenceKey(start), start);
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
            throw new PrismarineWorldErrors.ProviderCannotCaptureReplay({
                name: this.provider.constructor.name
            });
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
            version: 3,
            level: {
                name: this.name,
                seed: this.seed.toString(),
                tick: this.getTicks(),
                weather: { ...this.weather.saved() },
                gameRules,
                dimensions
            },
            contentFingerprint: this.server.getContent().contentFingerprint,
            worldgenFingerprint,
            activeContentFingerprint,
            randomState: this.server.getReplayRandomState(),
            loadedWorldDigests: this.replayWorldDigests(),
            settlingChunks: [...this.worlds()]
                .map((world) => [world.getDimension().id, world.settlingChunks()] as const)
                .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
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
        // Before the digests are compared, which cover them, and put back as they were if the
        // manifest turns out not to be this level's.
        const settling = new Map(manifest.settlingChunks);
        const before = [...this.worlds()].map((world) => [world, world.settlingChunks()] as const);
        for (const world of this.worlds()) world.restoreSettlingChunks(settling.get(world.getDimension().id) ?? []);
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
            manifest.level.tick !== this.getTicks() ||
            JSON.stringify(manifest.level.weather) !== JSON.stringify(this.weather.saved()) ||
            JSON.stringify(manifest.level.gameRules) !== JSON.stringify(currentGameRules) ||
            JSON.stringify(manifest.level.dimensions) !== JSON.stringify(currentDimensions) ||
            manifest.contentFingerprint !== this.server.getContent().contentFingerprint ||
            manifest.worldgenFingerprint !== currentInputs.worldgenFingerprint ||
            manifest.activeContentFingerprint !== currentInputs.activeContentFingerprint ||
            manifest.storageBoundary.provider !== this.provider.constructor.name ||
            JSON.stringify(manifest.loadedWorldDigests) !== JSON.stringify(this.replayWorldDigests())
        ) {
            for (const [world, chunks] of before) world.restoreSettlingChunks(chunks);
            throw new PrismarineWorldErrors.ReplayLevelMismatch();
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
        // The saved ticking areas start loading their chunks, as BDS's do when its world opens.
        this.getTickingAreas();
    }

    /** Opens the provider and puts back what the save held. */
    private async open(): Promise<void> {
        await this.provider.enable();

        // Before anything is migrated or written, so a refused save is left as it was.
        const levelDat = this.provider.readLevelData();
        try {
            assertJavaDataVersionOpens(this.name, levelDat?.javaDataVersion, this.javaTarget);
        } catch (error: unknown) {
            // The database lock would outlive the refusal and keep the save from opening again.
            await this.provider.disable();
            throw error;
        }
        // Raised now, before any chunk this target writes can be committed. A save pass commits
        // its chunks first and writes `level.dat` last, so a crash between the two would leave
        // newer chunks under an older bound, which an older release would then open. A bound
        // ahead of the chunks only refuses that older release, which is the safe side.
        const storedDataVersion = levelDat?.javaDataVersion;
        if (storedDataVersion === undefined || storedDataVersion < this.javaTarget.dataVersion) {
            this.provider.saveLevelData({ javaDataVersion: this.javaTarget.dataVersion });
        }

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
        this.storedTickingAreas = stored.tickingAreas ?? [];
        this.scriptSettings.restore(stored.scriptSettings);
        const records = this.provider.readLevelRecords();
        if (records !== null) {
            this.dynamicProperties.restore(records.dynamicProperties);
            this.scoreboard.restore(records.scoreboard);
            this.commandStorage.restore(records.commandStorage);
            for (const start of records.referencedStructures) this.referenceStructure(start);
            for (const [id, map] of records.maps) this.maps.set(id, map);
        }

        // The clocks are written to `level.dat` alone, so they are read back from there; without
        // them every boot started the day over at tick zero. A save from before the game clock was
        // written on its own held one clock, which was both.
        const gameTime = levelDat?.currentTick ?? levelDat?.time;
        if (gameTime !== undefined) this.setTicks(gameTime);
        if (levelDat?.time !== undefined) this.setDayTime(levelDat.time);
        if (stored.clockPaused !== undefined) this.setDayTimePaused(stored.clockPaused);
        if (stored.lastMapId !== undefined) this.lastMapId = stored.lastMapId;
        this.experiments = levelExperiments(this.config.experiments, levelDat?.experiments);
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

        this.clock.tick();
        this.weather.tick(this.getTicks());
        const worlds = this.worldsInStemOrder();
        for (const world of worlds) {
            try {
                world.update(tick);
            } catch (error: unknown) {
                this.server.getLogger().error(`World ${world.getFormattedName()} failed tick ${tick}`);
                this.server.getLogger().error(error);
            }
        }

        // After every world, so an autosave's cut is the state at the end of this tick in each
        // dimension (ADR 0018).
        const endSaveProfile = profileSpanStarter(this.server)?.(`Level.save:${this.name}`);
        try {
            this.saves.tick(this.getTicks(), worlds);
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
                this.server.getLogger().error(`World ${world.getFormattedName()} failed to close tick ${tick}`);
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
     * data. See `LevelSave.save`.
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
     * see `LevelSave.pendingCommit`.
     */
    public async pendingSave(): Promise<void> {
        await this.saves.pendingCommit();
    }

    /**
     * Writes the level's own state through the provider: the spawn, rules, weather and stems
     * into the provider's record, and the spawn, clock, generator and Nether scale into
     * `level.dat`. Queued behind a pass that is running; see `LevelSave.saveLevelData`.
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
            this.server.getLogger().debug(`No spawn point to save for ${this.name}`);
        }

        const stems = Object.fromEntries([...this.stems].filter(([id]) => !this.scriptStems.has(id)));
        const dragonFight = this.dragonFightState();
        const raids = this.raidState();
        const position = spawn ? { x: spawn.getX(), y: spawn.getY(), z: spawn.getZ() } : undefined;
        return {
            record: {
                levelId: this.id,
                ...(position === undefined ? {} : { spawn: position }),
                gameRules: Array.from(this.gameRuleManager.getGameRules()),
                weather: this.weather.saved(),
                ...(this.provider.supportsChunkUnload === true ? {} : { entities: this.entitySnapshots() }),
                worldGenSettings: { seed: this.seed.toString(), dimensions: stems },
                ...(dragonFight === undefined ? {} : { dragonFight }),
                ...(raids === undefined ? {} : { raids }),
                // Written even when empty: the provider keeps a field left out, which would bring
                // back the last area removed.
                tickingAreas: this.tickingAreas?.all() ?? [...this.storedTickingAreas],
                scriptSettings: this.scriptSettings.saved(),
                dimensionNumbers: this.dimensionNumbers.saved(),
                clockPaused: this.isDayTimePaused(),
                lastMapId: this.lastMapId
            },
            levelDat: {
                ...(position === undefined ? {} : { spawn: position }),
                time: this.getDayTime(),
                currentTick: this.getTicks(),
                stems,
                netherScale: this.netherScale(),
                // Java rewrites a save's data version to its own on every save, and so does this.
                // Opening refused an older target, so this never lowers the stored version.
                javaDataVersion: this.javaTarget.dataVersion,
                experiments: this.experiments
            },
            records: {
                dynamicProperties: this.dynamicProperties.all(),
                scoreboard: this.scoreboard.saved((live) => this.savedActorId(live)),
                commandStorage: this.commandStorage.saved(),
                maps: new Map(this.maps),
                referencedStructures: [...this.referencedStructures.values()]
            }
        };
    }

    /**
     * The saved id, Bedrock's `UniqueID`, of an entity in one of the level's worlds, by its
     * runtime id. The cut gives an entity its id before the level's records are taken.
     */
    private savedActorId(live: string): bigint | undefined {
        if (!/^\d+$/.test(live)) return undefined;
        for (const world of this.worlds()) {
            const actor = world.getActor(BigInt(live));
            const nbt = actor?.persistentNbt;
            if (nbt?.has('UniqueID')) return nbt.getLong('UniqueID', 0n);
        }
        return undefined;
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
