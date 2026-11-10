import type GameRuleManager from './GameRuleManager';
import { GameRules } from './GameRuleManager';

import { createHash } from 'node:crypto';
import type { Hash } from 'node:crypto';

import { Vector3 } from '@jsprismarine/math';
import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTWriter } from '@jsprismarine/nbt';
import type { ActorEvent } from '@jsprismarine/minecraft';
import { Gametype, getGametypeName, LevelEvent, LevelSoundEvent } from '@jsprismarine/minecraft';
import { writeBlockEntity } from '../blockentity/blockEntityWrite';
import { BlockView } from '../entity/ai/BlockView';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import type { LevelStem } from '@jsprismarine/worldgen';
import type { Block, Server, Service } from '../';
import Timer from '../utils/Timer';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import { randomOf } from '../utils/Random';
import type { Random } from '../utils/Random';
// Imported straight from its module rather than through the barrel: `index.ts` exports
// `./world/` before `Player`, so reaching for it via '../' lands back in a module that is
// still initializing and the binding is not a constructor yet when `instanceof` runs.
import Player from '../Player';
import { storedAdvancements } from '../advancement/progress';
import { enchantmentSeedOf } from '../enchantment/enchantingTable';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { BlockStateSchemas } from '../block/state/BlockStateSchema';
import type { BlockState } from '../block/state/BlockState';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import { writtenEntities } from '../entity/Entities';
import type { EntityIndex } from '../entity/data/entityIndex';
import type { LiveEntityRuntime } from '../entity/data/live';
import { DATA_ENTITY_TAG, dataEntityRecordIn } from '../entity/data/persistence';
import EntitySerializer from '../entity/EntitySerializer';
import { ITEM_POSITION_OFFSET, Item as ItemEntity } from '../entity/other/Item';
import type { Entity } from '../entity/Entity';
import type { StatusEffect, StatusEffectChange } from '../entity/StatusEffect';
import { GenericEntity } from '../entity/GenericEntity';
import ContainerEntry from '../inventory/ContainerEntry';
import { storedInventory, storedItem } from '../inventory/persistence';
import { Item } from '../item/Item';
import BlockUpdateScheduler from './BlockUpdateScheduler';
import { breakBlockWithContent, collectBreakDrops, wearBreakingTool } from './blockBreak';
import { notifyContentNeighbors } from './neighborContent';
import CoordinateUtils from './CoordinateUtils';
import type { NamedSoundOptions, WorldChangeSink } from './WorldChangeSink';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';
import { Dimensions, maxY } from './Dimension';
import { placePlayerSpawn, SPAWN_RELOCATION_RANGE } from './SpawnPlacement';
import BlockPhysics from './physics/BlockPhysics';
import type { DimensionType } from './Dimension';
import type { BlockMining } from './BlockMining';
import type { WorldConfig, WorldPlayerData } from '../config/JsonConfigTypes';
import { Position } from './Position';
import type { PlayerSpawn, RelocationOffset } from './SpawnPlacement';
import Progress from '../utils/Progress';
import { blockFromContent } from '../block/Block';
import type { BiomeSearchResult, Generator, ChunkRequestOptions, StructureSearchResult } from './Generator';
import { GenerationStopped } from './Generator';
import { createEngineWorld } from './EngineWorld';
import type { RandomTickChunk, SystemBlock, WorldSystemsOptions } from './WorldSystems';
import { WorldSystems } from './WorldSystems';
import { DEFAULT_RANDOM_TICK_SPEED } from '@jsprismarine/engine-systems';
import type { Weather } from '@jsprismarine/engine-systems';
import type { ContentPosition } from '../content/world/adapter';
import { profileSpanStarter } from '../profiling/ServerProfiler';
import Chunk from './chunk/Chunk';
import { DragonFight } from './end/DragonFight';
import { exposedFluidsOf } from './exposedFluids';
import type { RaidHost, RaidRecord } from './raid/RaidManager';
import { RaidManager } from './raid/RaidManager';
import type { DragonFightState } from './WorldPersistence';
import { isMidDimensionChange } from './portal/DimensionTravel';
import type { PortalBlockRef } from './portal/DimensionTravel';
import { PortalIndex } from './portal/PortalIndex';
import type { ChunkAdmission, ChunkAdmissionScheduler } from './ChunkAdmissions';
import { chunkAdmissionWorld } from './ChunkAdmissions';
import type { ChunkCompletionScheduler } from './ChunkCompletionQueue';
import type { TickWaitTracker } from './TickContext';
import { currentTickScope, currentTickWaitTracker, insideTick } from './TickContext';
import { isPortalBlock } from './portal/rules';
import { furnaceScreenData, tickFurnace } from './cooking';
import { tickSpawner } from './spawners';
import type { SpawnerSurroundings } from './spawners';
import type { GameEventListener } from './GameEventListenerRegistry';
import { GameEventListenerRegistry } from './GameEventListenerRegistry';
import type BaseProvider from './providers/BaseProvider';
import type { ChunkSaveContext } from './providers/ChunkSaveContext';
import { createChunkSaveContext } from './providers/ChunkSaveContext';
import type { Level } from './Level';

export type { LevelData, StoredPlayerAttribute, WorldConfig, WorldPlayerData } from '../config/JsonConfigTypes';

/** How far out to look for dry land, and how coarsely, before giving up. */
/** The delay a fluid's first tick waits, Java's five ticks for water and thirty for overworld lava. */
const WATER_SPREAD_TICKS = 5;
const LAVA_SPREAD_TICKS = 30;

const SPAWN_SEARCH_RADIUS = 256;
const SPAWN_SEARCH_STEP = 8;

/**
 * Bare terrain a player must not be dropped onto, for the generators that can answer from it.
 *
 * Short, because the bare terrain holds no decoration: the top of a column is the ground, the
 * sea, or a lava lake's surface, and never a flower or a leaf.
 */
const UNSUITABLE_SPAWN_TERRAIN = new Set(['minecraft:water', 'minecraft:lava', 'minecraft:air']);

/** Whether a drop is an empty item stack. */
const isEmptyItemDrop = (drop: Block | Item): boolean =>
    drop instanceof Item && (drop.getName() === 'minecraft:air' || drop.getAmount() <= 0);

/**
 * Surfaces a player must not be dropped onto: water because it is not land, and the
 * decoration blocks because standing on a flower or in a canopy is not a spawn point.
 */
const UNSUITABLE_SPAWN_SURFACES = new Set([
    'minecraft:water',
    'minecraft:air',
    'minecraft:oak_leaves',
    'minecraft:birch_leaves',
    'minecraft:oak_log',
    'minecraft:birch_log',
    'minecraft:short_grass',
    'minecraft:tall_grass',
    'minecraft:dandelion',
    'minecraft:poppy',
    'minecraft:deadbush'
]);

/** The sea level of Java's Overworld `noise_settings`, assumed for a generator that reports none. */
const DEFAULT_SEA_LEVEL = 63;

/**
 * How far `/locate` looks when nothing says otherwise, in rings of placement regions.
 *
 * Java's `LocateCommand.MAX_STRUCTURE_SEARCH_RADIUS`, which `EyeOfEnder` shares. A region is a
 * structure set's `spacing`, so this reaches 3400 chunks for a village and every ring of the
 * strongholds' concentric placement; see {@link StructureSearchRequest.radius}.
 */
const LOCATE_RADIUS = 100;

/**
 * How Java's `LocateCommand` walks for a biome: `MAX_BIOME_SEARCH_RADIUS` blocks out, one column
 * every `BIOME_SAMPLE_RESOLUTION_HORIZONTAL` blocks and one sample every
 * `BIOME_SAMPLE_RESOLUTION_VERTICAL` blocks of a column.
 */
const BIOME_SEARCH = { radius: 6400, horizontalStep: 32, verticalStep: 64 } as const;

/**
 * A registry name as Java's `ResourceLocation.read` completes it: `plains` is `minecraft:plains`.
 */
const namespaced = (name: string): string => (name.includes(':') ? name : `minecraft:${name}`);

/**
 * Whether a structure identifier is what a player meant by a name.
 *
 * Bedrock's `/locate structure` names a family - `village`, `ruinedportal` - where Java has one
 * identifier per variant, so an exact comparison would find none of them. Three spellings are
 * accepted, from most to least specific: the full identifier, the path on its own, and the path
 * with a variant suffix, which is what makes `village` find `minecraft:village_plains`.
 *
 * Underscores are dropped from the comparison so Bedrock's `ruinedportal` reaches Java's
 * `ruined_portal`.
 *
 * @param name - What the player typed.
 * @param structure - A structure identifier the generator knows.
 */
export const structureNameMatches = (name: string, structure: string): boolean => {
    const squash = (value: string): string => value.toLowerCase().replaceAll('_', '');
    const wanted = squash(name.startsWith('#') ? name.slice(1) : name);
    const path = structure.includes(':') ? structure.slice(structure.indexOf(':') + 1) : structure;

    if (squash(structure) === wanted || squash(path) === wanted) return true;

    // A family name, which only counts at a variant boundary: `village` is `village_plains`,
    // but `ruin` must not be `ruined_portal`.
    return path
        .toLowerCase()
        .split('_')
        .some((_part, index, parts) => index > 0 && squash(parts.slice(0, index).join('_')) === wanted);
};

/** Chunks generated between yields to the event loop while preloading. */
const PRELOAD_BATCH_SIZE = 32;

/** What a chunk load in flight shares with the callers that join it. */
interface ChunkLoadState {
    /** How badly the chunk is wanted, raised by a caller that joins and wants it more. */
    readonly urgency: { value: NonNullable<ChunkRequestOptions['urgency']> };
    /** Whether the chunk is ready and waits only for an input step to admit it. */
    parked: boolean;
    /** The trackers of the callers waiting, told when the load parks and when it moves on. */
    readonly waiters: TickWaitTracker[];
    /** The tick that waits for the chunk, if one does. */
    wantedBy: { readonly open: boolean } | undefined;
}

/** One chunk load in flight. */
interface ChunkLoad extends ChunkLoadState {
    readonly chunk: Promise<Chunk>;
}

/**
 * Chunks written between yields to the event loop while saving.
 *
 * Smaller than the preload's batch because a save happens while players are connected: eight
 * chunks is a couple of milliseconds, so a tick that lands mid-save is late rather than lost.
 */
const SAVE_BATCH_SIZE = 8;

/** How many chunks one tick may write and unload after players move away. */
const CHUNK_UNLOAD_BATCH_SIZE = 8;

/**
 * How far from a player the world simulates, in chunks.
 *
 * Java Edition's `simulation-distance` default, and a separate thing from how far a client is
 * sent chunks: a player sees terrain they are not simulating. A chunk outside every player's
 * radius stays in memory and stays still, which is Java's own rule and the reason an empty
 * server costs nothing to run.
 */
export const SIMULATION_DISTANCE = 10;

/** One fully lit chunk beyond simulation distance keeps edge light propagation complete. */
const LIGHT_GUARD_CHUNKS = 1;

/**
 * How much a body is shrunk before the blocks it overlaps are listed: Java's
 * `Entity.checkInsideBlocks` deflates the bounding box by `1.0E-6`.
 */
const BODY_SHRINK = 1e-6;

interface PlayerChunkCoverage {
    readonly x: number;
    readonly z: number;
    readonly viewDistance: number;
}

type ChunkPlayerCounts = [simulation: number, retention: number, light: number];

interface ChunkRectangle {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
}

/**
 * Counts how many players' simulation and retention areas cover each chunk.
 *
 * Separate counts preserve the fixed simulation radius and each player's potentially larger
 * view distance. Stable players cost one map read per loaded chunk; moving a player updates only
 * the areas whose counts changed.
 */
class PlayerChunkRefCounts {
    private readonly players = new Map<number, PlayerChunkCoverage>();
    private readonly chunks = new Map<number, ChunkPlayerCounts>();
    private readonly loadedChunks = new Set<number>();
    private readonly unloadCandidates = new Set<number>();
    private revision = 0;

    public synchronize(players: ReadonlyMap<number, Player>): void {
        let changed = false;
        for (const [runtimeId, player] of players) {
            const position = player.getPosition();
            const coverage = {
                x: CoordinateUtils.fromBlockToChunk(position.getX()),
                z: CoordinateUtils.fromBlockToChunk(position.getZ()),
                viewDistance: Math.floor(Math.max(SIMULATION_DISTANCE, player.viewDistance))
            };
            const previous = this.players.get(runtimeId);
            if (
                previous !== undefined &&
                previous.x === coverage.x &&
                previous.z === coverage.z &&
                previous.viewDistance === coverage.viewDistance
            )
                continue;

            this.changeCoverage(previous, coverage);
            this.players.set(runtimeId, coverage);
            changed = true;
        }

        for (const [runtimeId, coverage] of this.players) {
            if (players.has(runtimeId)) continue;

            this.changeCoverage(coverage, undefined);
            this.players.delete(runtimeId);
            changed = true;
        }

        if (changed) this.revision++;
    }

    public getRevision(): number {
        return this.revision;
    }

    /** Adds one loaded chunk to the maintained set eligible for distant unload. */
    public chunkLoaded(chunk: Chunk): void {
        const x = chunk.getX();
        const z = chunk.getZ();
        const index = Chunk.packXZ(x, z);
        this.loadedChunks.add(index);
        if (this.retains(x, z)) this.unloadCandidates.delete(index);
        else this.unloadCandidates.add(index);
    }

    /** Removes an unloaded chunk from both maintained chunk indexes. */
    public chunkUnloaded(chunk: Chunk): void {
        const index = Chunk.packXZ(chunk.getX(), chunk.getZ());
        this.loadedChunks.delete(index);
        this.unloadCandidates.delete(index);
    }

    public getUnloadCandidates(): Iterable<number> {
        return this.unloadCandidates;
    }

    public simulates(chunkX: number, chunkZ: number): boolean {
        return (this.chunks.get(Chunk.packXZ(chunkX, chunkZ))?.[0] ?? 0) > 0;
    }

    public retains(chunkX: number, chunkZ: number): boolean {
        return (this.chunks.get(Chunk.packXZ(chunkX, chunkZ))?.[1] ?? 0) > 0;
    }

    public lights(chunkX: number, chunkZ: number): boolean {
        return (this.chunks.get(Chunk.packXZ(chunkX, chunkZ))?.[2] ?? 0) > 0;
    }

    private changeCoverage(previous: PlayerChunkCoverage | undefined, next: PlayerChunkCoverage | undefined): void {
        this.changeCoverageArea(previous, next, SIMULATION_DISTANCE, 'simulation');
        this.changeCoverageArea(previous, next, SIMULATION_DISTANCE + LIGHT_GUARD_CHUNKS, 'light');
        this.changeCoverageArea(previous, next, previous?.viewDistance ?? next?.viewDistance ?? 0, 'retention');
    }

    private changeCoverageArea(
        previous: PlayerChunkCoverage | undefined,
        next: PlayerChunkCoverage | undefined,
        radius: number,
        area: 'simulation' | 'retention' | 'light'
    ): void {
        const previousArea =
            previous === undefined
                ? undefined
                : this.rectangleAt(previous, area === 'retention' ? previous.viewDistance : radius);
        const nextArea =
            next === undefined ? undefined : this.rectangleAt(next, area === 'retention' ? next.viewDistance : radius);
        this.changeRectangleDifference(previousArea, nextArea, area, -1);
        this.changeRectangleDifference(nextArea, previousArea, area, 1);
    }

    private rectangleAt(coverage: PlayerChunkCoverage, radius: number): ChunkRectangle {
        return {
            minX: coverage.x - radius,
            maxX: coverage.x + radius,
            minZ: coverage.z - radius,
            maxZ: coverage.z + radius
        };
    }

    /** Applies only the source rectangle's strips that do not overlap the destination. */
    private changeRectangleDifference(
        source: ChunkRectangle | undefined,
        destination: ChunkRectangle | undefined,
        area: 'simulation' | 'retention' | 'light',
        change: -1 | 1
    ): void {
        if (source === undefined) return;
        if (destination === undefined) {
            this.changeArea(source, area, change);
            return;
        }

        const minX = Math.max(source.minX, destination.minX);
        const maxX = Math.min(source.maxX, destination.maxX);
        const minZ = Math.max(source.minZ, destination.minZ);
        const maxZ = Math.min(source.maxZ, destination.maxZ);
        if (minX > maxX || minZ > maxZ) {
            this.changeArea(source, area, change);
            return;
        }

        if (source.minZ < minZ)
            this.changeArea({ minX: source.minX, maxX: source.maxX, minZ: source.minZ, maxZ: minZ - 1 }, area, change);
        if (maxZ < source.maxZ)
            this.changeArea({ minX: source.minX, maxX: source.maxX, minZ: maxZ + 1, maxZ: source.maxZ }, area, change);
        if (source.minX < minX) this.changeArea({ minX: source.minX, maxX: minX - 1, minZ, maxZ }, area, change);
        if (maxX < source.maxX) this.changeArea({ minX: maxX + 1, maxX: source.maxX, minZ, maxZ }, area, change);
    }

    private changeArea(rectangle: ChunkRectangle, area: 'simulation' | 'retention' | 'light', change: -1 | 1): void {
        const countIndex = area === 'simulation' ? 0 : area === 'retention' ? 1 : 2;
        for (let chunkX = rectangle.minX; chunkX <= rectangle.maxX; chunkX++) {
            for (let chunkZ = rectangle.minZ; chunkZ <= rectangle.maxZ; chunkZ++) {
                const key = Chunk.packXZ(chunkX, chunkZ);
                const counts: ChunkPlayerCounts = this.chunks.get(key) ?? [0, 0, 0];
                counts[countIndex] += change;

                if (area === 'retention') {
                    if (counts[1] > 0) this.unloadCandidates.delete(key);
                    else if (this.loadedChunks.has(key)) this.unloadCandidates.add(key);
                }

                if (counts[0] === 0 && counts[1] === 0 && counts[2] === 0) this.chunks.delete(key);
                else this.chunks.set(key, counts);
            }
        }
    }
}

/** Sky light at a position nothing stands over, which is what `Level.canSeeSky` answers. */
const FULL_SKY_LIGHT = 15;

/** Where one dropped stack starts, and how fast it leaves; see {@link World.dropContents}. */
interface DropStart {
    /** Where the stack lies, below the position its entity reports. */
    readonly position: Vector3;
    /** Its speed in blocks per tick, or still when absent. */
    readonly motion?: Vector3;
    /** Ticks before a player may pick it up, or the item entity's default when absent. */
    readonly pickupDelay?: number;
}

/**
 * Where a stack leaving a block appears and how fast it leaves, as a Bedrock Dedicated Server
 * 1.26.52 drops one.
 *
 * Measured over 18 drops: each appeared somewhere in the middle 70% of the block on every axis
 * and left with a push of up to 0.1 a tick sideways and 0.2 upward.
 * @param {ContentPosition} block - the block the stack leaves.
 * @param {Random} random - the source of chance, rolled five times.
 * @returns {DropStart} where the stack lies and its speed.
 */
const popOut = (block: ContentPosition, random: Random): DropStart => {
    const within = (): number => 0.15 + random() * 0.7;
    const push = (): number => random() * 0.2 - 0.1;
    const position = new Vector3(block.x + within(), block.y + within(), block.z + within());

    return { position, motion: new Vector3(push(), 0.2, push()) };
};

/**
 * The crack particles, indexed by the face that was struck.
 *
 * Six events rather than one with the face packed into its data, which is how the protocol
 * chose to spell it. Written out rather than computed from the first one, so a renumbering
 * upstream is a compile error here and not a shower of particles off the wrong side.
 */
const CRACK_PARTICLES: readonly LevelEvent[] = [
    LevelEvent.PARTICLES_CRACK_BLOCK_DOWN,
    LevelEvent.PARTICLES_CRACK_BLOCK_UP,
    LevelEvent.PARTICLES_CRACK_BLOCK_NORTH,
    LevelEvent.PARTICLES_CRACK_BLOCK_SOUTH,
    LevelEvent.PARTICLES_CRACK_BLOCK_WEST,
    LevelEvent.PARTICLES_CRACK_BLOCK_EAST
];

export interface WorldData {
    name: string;
    path: string;
    server: Server;
    /**
     * The level this world is one dimension of, which owns the provider, the seed, the clock,
     * the game rules, the weather, the spawn and the player records.
     */
    level: Level;
    /** The stem this world was built from: its dimension type and its generator definition. */
    stem: LevelStem;
    /** The generator the level's factories built for {@link WorldData.stem}. */
    generator: Generator;
    /** Shared ticker queue for lighting chunks that are still background work. */
    completionQueue?: ChunkCompletionScheduler;
    config?: WorldConfig;
    /** Defaults to the level's resolved type for the stem, or the Overworld when it has none. */
    dimension?: DimensionType;
    /**
     * Whether {@link World.enable} settles the spawn and generates the chunks around it.
     *
     * `prepared`, the default, is for a world built as its level opens: the first player
     * arrives into generated terrain. `deferred` is for a world the level builds on its first
     * visit, from inside a server tick: enabling does neither, the travel path loads the
     * chunks the arrival needs, and a spawn is searched for only if something asks for one.
     */
    startRegion?: 'prepared' | 'deferred';
    /**
     * What to run when a random tick lands on a block, keyed by block identifier.
     *
     * The world draws the positions and `@jsprismarine/engine-systems` filters them; what a
     * crop, a fire or a melting block then does is the behavior families' business, so it
     * arrives from outside. Left out, the draws still happen and nothing answers them.
     */
    randomTickHandlers?: WorldSystemsOptions['randomTickHandlers'];
    /**
     * What to run when a scheduled block tick lands on a block, keyed by block identifier.
     *
     * Migrated content hooks answer before the engine fallback. Ticks still owned by the engine
     * stay on that path. Left out, every scheduled tick goes straight to the engine.
     */
    blockTickHandlers?: WorldSystemsOptions['blockTickHandlers'];
    /** Content redstone hooks and their power cache lifecycle. */
    redstoneUpdateHandlers?: WorldSystemsOptions['redstoneUpdateHandlers'];
}

/** How a broadcast narrows its audience beyond "everyone who can see the place". */
export interface AudienceOptions {
    /**
     * A cap in blocks, tighter than the recipient's view distance.
     *
     * For things that should not carry as far as a client can see - a block breaking is
     * audible for about sixteen blocks, not for a hundred and sixty.
     */
    radius?: number;
    /** Recipients left out whatever the geometry says, usually whoever caused the event. */
    exclude?: Player | readonly Player[];
}

export class World implements Service {
    private static nextBlockWriteVersion = 0;

    private readonly uuid: string = UUID.randomString();
    private name: string;

    private readonly entities: Map<number, Entity> = new Map();
    private readonly entityChunkIndices = new Map<number, number>();
    /** Reverse membership lets unloads visit one chunk's actors without rescanning the world. */
    private entityRuntimeIdsByChunk = new Map<number, Set<number>>();
    private gameEventListenerRegistry: GameEventListenerRegistry | undefined;

    /**
     * The subset of `entities` that are player-controlled, kept alongside it.
     *
     * `getPlayers()` is called on essentially every broadcast, and deriving it meant walking
     * every entity in the world each time. Holding the players separately makes that a read.
     */
    private readonly players: Map<number, Player> = new Map();
    private readonly chunks: Map<number, Chunk> = new Map();
    private blockWriteVersion = World.nextBlockWriteVersion++;
    private playerChunkRefCounts: PlayerChunkRefCounts | undefined;
    private loadedChunksRevision = 0;
    private portalRuntimeIds: Map<number, boolean> | undefined;
    private portalRuntimeIdsRevision: number | undefined;
    private lightChunksCache:
        | {
              readonly coverageRevision: number;
              readonly loadedRevision: number;
              readonly chunks: readonly { readonly x: number; readonly z: number }[];
          }
        | undefined;
    private simulationChunksCache:
        | { readonly coverageRevision: number; readonly loadedRevision: number; readonly chunks: readonly Chunk[] }
        | undefined;

    /**
     * The chunk loads that have been started and have not finished, by packed position.
     *
     * What makes a second request for a chunk already on its way wait for that one instead of
     * generating it again. See {@link World.loadChunk}.
     */
    private readonly loading: Map<number, ChunkLoad> = new Map();

    /** The last chunk {@link getLoadedChunk} answered with. A packed key is never negative. */
    private lastChunkIndex = -1;
    private lastChunk: Chunk | null = null;
    private lastChunkSource: Map<number, Chunk> | null = null;

    /** Two minutes at the server's twenty ticks per second. */
    private static readonly AUTO_SAVE_INTERVAL_TICKS = 20 * 120;

    /**
     * The save that is still running, or null when none is.
     *
     * It settles when that pass is done and never rejects, so a pass queued behind it cannot
     * fail on its predecessor's behalf. See {@link World.enqueueSave}.
     *
     * A tick starts a save and does not wait for it. Writing 441 freshly generated chunks
     * takes about a second and a half, and `Server.tick` installs the next tick's timer only
     * once `update` has resolved - so an awaited autosave stopped the world for as long as it
     * took. That is under the loop's two second catch-up limit on an idle machine and over it
     * on a busy one, which is the whole of the difference between a server that holds 20 TPS
     * and one that announces it has skipped ninety ticks. {@link saveChunks} already yields
     * between batches; not awaiting it is what lets those yields reach the tick loop rather
     * than only the socket.
     */
    private saving: Promise<void> | null = null;
    /** One selected unload batch, queued behind the same writer as saves. */
    private unloading: Promise<void> | null = null;
    private readonly server: Server;
    private readonly level: Level;
    private readonly stem: LevelStem;
    private readonly generator: Generator;
    private readonly completionQueue: ChunkCompletionScheduler | undefined;
    private readonly config: WorldConfig;
    private readonly dimension: DimensionType;
    private readonly startRegion: 'prepared' | 'deferred';

    /**
     * This world's own spawn, for a dimension other than the Overworld.
     *
     * Bedrock keeps one spawn per save and it is in the Overworld, so the Overworld world keeps
     * its spawn on the level, where the save reads and writes it; see
     * {@link World.getKnownSpawnPosition}.
     */
    private spawn: Vector3 | null = null;

    /**
     * Set the moment a shutdown begins. It stops the preload and the tick, so that nothing new
     * is started while the final save runs.
     *
     * A world is torn down while its start region is still generating on every dev restart, so
     * this is the ordinary case rather than a defensive one.
     */
    private closing = false;

    /**
     * The start region work while it is running, so a shutdown can wait for it rather than
     * race it. Null the rest of the time.
     */
    private startingRegion: Promise<void> | null = null;

    /** Positions waiting to react to a nearby change, and what they do about it. */
    private readonly blockUpdates = new BlockUpdateScheduler();

    /**
     * Every lit nether portal block in memory, which is what a trip into this world searches.
     * Built on first use, as {@link playerChunkRefCounts} is, so a world double assembled from
     * the prototype has one too.
     */
    private portalIndex: PortalIndex | undefined;

    /** The End's dragon fight, created on the first ask in a dimension that has one. */
    private dragonFight: DragonFight | undefined;
    private raidManager: RaidManager | undefined;
    private readonly physics: BlockPhysics;

    /**
     * The light engine and the two scheduled tick lists.
     *
     * Built here rather than lazily so the content adapter's `ticks` group has something to
     * schedule into before the first chunk loads.
     */
    private readonly systems: WorldSystems;

    /**
     * Where this world reports what happened in it.
     *
     * Dropped on the floor until something attaches a real one, which is what makes a world
     * runnable with no network layer at all - see {@link WorldChangeSink}.
     */
    private changes: WorldChangeSink = NULL_WORLD_CHANGE_SINK;

    public constructor({
        name,
        server,
        level,
        stem,
        generator,
        completionQueue,
        config,
        dimension,
        startRegion,
        randomTickHandlers,
        blockTickHandlers,
        redstoneUpdateHandlers
    }: WorldData) {
        this.name = name;
        this.server = server;
        this.level = level;
        this.stem = stem;
        this.generator = generator;
        this.completionQueue = completionQueue;
        this.config = config ?? {};
        this.dimension = dimension ?? level.getDimensionTypes().get(stem.type) ?? Dimensions.Overworld;
        this.startRegion = startRegion ?? 'prepared';
        this.physics = new BlockPhysics(this);
        this.systems = new WorldSystems({
            view: {
                dimension: this.dimension,
                blockAt: (x, y, z) => this.loadedBlockAt(x, y, z),
                blockRuntimeIdAt: (x, y, z) => this.loadedBlockRuntimeIdAt(x, y, z),
                topOfColumn: (x, z) => this.topOfColumn(x, z),
                loadedChunks: () => Array.from(this.chunks.values(), (chunk) => ({ x: chunk.getX(), z: chunk.getZ() })),
                lightChunks: () => this.lightChunks(),
                shouldInitializeLight: (chunkX, chunkZ) => this.chunkNeedsLight(chunkX, chunkZ),
                lightSectionAt: (chunkX, sectionY, chunkZ) => this.lightSectionPalette(chunkX, sectionY, chunkZ),
                randomTickSpeed: () => {
                    const [value] = this.getGameRuleManager().getGameRule(GameRules.RandomTickSpeed) ?? [];
                    return typeof value === 'number' ? value : DEFAULT_RANDOM_TICK_SPEED;
                },
                randomTickChunks: () => this.randomTickChunks()
            },
            world: createEngineWorld(this),
            // The blocks that answer a random tick are the behavior families in
            // `@jsprismarine/block-behaviors`, reached through the content world adapter, so
            // `WorldManager` builds these from the content registries. They are optional
            // because a world built by hand in a test has none. The positions are drawn either
            // way, so the draw sequence - which decides where crops grow - does not shift.
            randomTickHandlers,
            blockTickHandlers,
            redstoneUpdateHandlers
        });
    }

    /**
     * Gives this world somewhere to report its changes.
     *
     * Attached from outside rather than built here, for the same reason a player does not
     * build its own session: the world would otherwise have to know the network layer exists
     * in order to construct a piece of it.
     * @param {WorldChangeSink} sink - Where changes go from now on.
     */
    public attachChangeSink(sink: WorldChangeSink): void {
        this.changes = sink;
    }

    /**
     * On enable hook: puts back what the save kept for this dimension and generates the start
     * region, unless {@link WorldData.startRegion} defers it. The level has opened the provider
     * and read the save-level state by now.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        // Deliberately *not* subscribed to the server's tick event. The level already calls
        // `update` on every world in its tick, and doing both ran each world - and so every
        // entity in it - twice per tick. Time itself went at double speed: breath ran out in
        // seven seconds instead of fifteen and drowning took four half-hearts a second
        // instead of two. The level's call is the one to keep, and the duplication is the
        // whole of the reason - the tick event is awaited inside the tick's budget now too,
        // so subscribing would buy nothing and cost a second update.

        // Snapshots a provider without actor storage kept beside the save. They were written
        // when the save had one world, so they are the Overworld's.
        if (this.isOverworld()) {
            for (const entityData of this.level.legacyEntities()) {
                // The saved coordinates are actually used now. They used to be spread into
                // an options object that had no place for them, so every entity restored
                // from disk silently reappeared at the origin.
                const { x, y, z } = entityData.position;
                const position = new Position(x, y, z, this);
                const Written = writtenEntities().get(entityData.type);
                const placement = {
                    position,
                    pitch: entityData.position.pitch,
                    yaw: entityData.position.yaw,
                    headYaw: entityData.position.headYaw
                };
                const body = Written
                    ? new Written(placement)
                    : new GenericEntity({ identifier: entityData.type, ...placement });

                // The level file has no component state, but a declared type can still resume
                // from its spawn event here. A chunk actor record replaces this body with the
                // saved runtime state when that chunk loads.
                if (!this.restoreDataEntity(body)) await this.addEntity(body);
            }
        }

        if (this.startRegion === 'deferred') return;

        this.startingRegion = this.prepareStartRegion();
        try {
            await this.startingRegion;
        } finally {
            this.startingRegion = null;
        }
    }

    /**
     * Settles where the world starts and generates the chunks around it.
     *
     * Held as one promise so {@link World.disable} can wait for all of it. Both halves
     * generate terrain, and a shutdown that closed the provider partway through either would
     * throw out of {@link World.enable} - which is a rejection nothing on the startup path
     * catches.
     *
     * Resolving the spawn here, once, is also what keeps it out of the save. Finding one
     * means searching for dry land, and searching means generating the terrain to look at,
     * so {@link World.saveLevelData} used to generate chunks from inside a tick.
     */
    private async prepareStartRegion(): Promise<void> {
        try {
            await this.getSpawnPosition();
        } catch (error: unknown) {
            if (!(error instanceof GenerationStopped)) throw error;

            // Left unresolved on purpose. `findSurfaceSpawn` falls back to the origin for a
            // world with no dry land within range, `saveLevelData` writes whatever spawn the
            // world knows, and `enable` reads that back on the next start - so settling for
            // the fallback here would make one interrupted search permanent. An unresolved
            // spawn writes nothing and is searched for again next time.
            return;
        }

        await this.preloadSpawnRegion();
    }

    /**
     * On disable hook.
     *
     * The order is the whole of it. Marking the world closing stops the preload asking for
     * more chunks and stops the tick; waiting for the start region means every chunk that was
     * generated is in `this.chunks` before the save walks it; and the provider is closed last,
     * once nothing is left that could ask it for anything.
     *
     * An autosave a tick started is one of those things. {@link World.save} waits for it
     * before writing anything of its own, so by the time the level closes the provider no
     * write is outstanding - closing the database under one is the same failure the start
     * region race used to cause. The provider itself is the level's to close, once every
     * world of the save has been through this.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        this.closing = true;

        // A start region that failed has already been reported to whoever awaited `enable`;
        // the save still has to happen, so its failure must not take this path down with it.
        await this.startingRegion?.catch(() => {});

        await this.unloading;
        await this.save();
    }

    public getGenerator(): Generator {
        return this.generator;
    }

    /**
     * The y this world's generator floods to, which worldgen's `relative_to_sea_level` anchors
     * and the content rules that ask about the water line resolve against.
     *
     * The generator's own answer when it has one, which the noise generator reads from its
     * stem's `noise_settings` and the flat generator fixes at Java's -63. A generator without
     * one gets the Overworld's 63.
     */
    public getSeaLevel(): number {
        return this.generator.seaLevel ?? DEFAULT_SEA_LEVEL;
    }

    /** Advances cooking block entities in chunks that are currently simulated. */
    private tickCookingStations(playerChunkRefCounts: PlayerChunkRefCounts): void {
        const content = this.server.getContent?.();
        if (content === undefined) return;

        for (const chunk of this.simulationChunks(playerChunkRefCounts)) {
            for (const blockEntity of chunk.getFurnaces()) {
                const position = blockEntity.getPosition();
                const x = position.getX();
                const y = position.getY();
                const z = position.getZ();
                const state = chunk.getBlock(x, y, z);
                const ticked = tickFurnace(content, blockEntity, state.name);
                if (ticked === undefined) {
                    // Send idle values after opening; PlayerSession skips unchanged values on later ticks.
                    this.sendCookingProgress({ x, y, z }, furnaceScreenData(blockEntity));
                    continue;
                }

                const blockChanged = state.name !== ticked.blockIdentifier;
                if (blockChanged) {
                    this.setLoadedBlockState(
                        x,
                        y,
                        z,
                        { name: ticked.blockIdentifier, states: state.properties },
                        false
                    );
                }
                writeBlockEntity(this, ticked.tags);
                // Whoever has this station open is watching its arrow and its flame, and the
                // block entity write alone tells them nothing.
                this.sendCookingProgress({ x, y, z }, furnaceScreenData(ticked.tags));
                if (blockChanged || ticked.inventoryChanged) notifyContentNeighbors(this, { x, y, z });
            }
        }
    }

    /**
     * Hands one cooking station's progress to every player with that station open.
     *
     * Fire and forget for the same reason the rest of the tick's sends are: the tick decides
     * the state now and the packets are not what makes it true, so a slow link delays a
     * progress bar rather than the world.
     */
    private sendCookingProgress(at: ContentPosition, properties: ReadonlyMap<number, number>): void {
        const position = new Vector3(at.x, at.y, at.z);
        for (const player of this.getPlayers()) {
            const session = player.getNetworkSession();
            if (session.getOpenBlockContainer() === undefined) continue;
            void session.sendContainerData(position, properties).catch((error: unknown) => {
                this.server.getLogger().error(error);
            });
        }
    }

    /**
     * Runs the monster spawners in chunks that are currently simulated.
     *
     * The cycle itself is {@link tickSpawner}; this answers what it asks about the world, makes
     * the mobs it decided on through the data runtime, and writes the delay back so the clients
     * holding the chunk and the next save both see it.
     */
    private tickSpawners(playerChunkRefCounts: PlayerChunkRefCounts): void {
        // Resolved on the first spawner met rather than up front: most ticks of most worlds
        // meet none, and this pass should cost them nothing.
        let random: (() => number) | undefined;
        let view: BlockView | undefined;

        for (const chunk of this.simulationChunks(playerChunkRefCounts)) {
            for (const blockEntity of chunk.getMobSpawners()) {
                random ??= this.server.getRandom();
                view ??= new BlockView(this);

                const ticked = tickSpawner(
                    blockEntity,
                    this.spawnerSurroundings(blockEntity.getPosition(), view, random)
                );
                if (ticked === undefined) continue;

                const identifier = blockEntity.getEntityIdentifier();
                const live = this.dataEntities();
                if (ticked.spawns.length > 0 && !live.runtime.content().entities.registry.has(identifier)) {
                    this.server.getLogger().debug(`A spawner asked for ${identifier}, which no data runtime declares`);
                } else {
                    for (const spawn of ticked.spawns)
                        live.runtime.spawn(identifier, spawn, { yaw: random() * 360, pitch: 0 });
                }
                writeBlockEntity(this, ticked.tags);
            }
        }
    }

    /** What one spawner sees of the world around its block, with the box rules Java's `BaseSpawner` reads by. */
    private spawnerSurroundings(at: Vector3, view: BlockView, random: () => number): SpawnerSurroundings {
        const center = new Vector3(at.getX() + 0.5, at.getY() + 0.5, at.getZ() + 0.5);
        // Java inflates the block's own box, so the range reaches one block further on the far side.
        const inBox = (x: number, y: number, z: number, range: number): boolean =>
            x >= at.getX() - range &&
            x <= at.getX() + 1 + range &&
            y >= at.getY() - range &&
            y <= at.getY() + 1 + range &&
            z >= at.getZ() - range &&
            z <= at.getZ() + 1 + range;

        return {
            random,
            isPlayerWithin: (range) =>
                this.getPlayers().some((player) => {
                    const feet = new Vector3(
                        player.getPosition().getX(),
                        player.getFeetY(),
                        player.getPosition().getZ()
                    );
                    return feet.distanceSquaredTo(center) <= range * range;
                }),
            countNearby: (identifier, range) =>
                this.getEntities().filter((entity) => {
                    const position = entity.getPosition();
                    return (
                        entity.getType() === identifier &&
                        inBox(position.getX(), entity.getFeetY(), position.getZ(), range)
                    );
                }).length,
            canSpawnAt: (x, y, z) =>
                view.isPassable(x, y, z) && view.isPassable(x, y + 1, z) && view.isSolid(x, y - 1, z)
        };
    }

    /**
     * Called every tick.
     *
     * @param tick
     */
    public async update(tick: number): Promise<void> {
        // A tick already in flight when the shutdown starts would otherwise run on through
        // the save and past the provider's close, and plenty of what a tick does - a block
        // update, a mob looking at the ground ahead of it - loads a chunk.
        if (this.closing) return;

        const startProfile = profileSpanStarter(this.server);

        // TODO: tick chunks

        // Auto save every 2 minutes. The interval has to be a remainder rather than an
        // equality: `currentTick / 20 === 120` holds for exactly one value of the counter,
        // so the world was saved once, two minutes in, and then never again for the rest
        // of the process' life.
        //
        // Started, not awaited - see {@link World.saving} for why the tick must not wait.
        const endAutoSaveProfile = startProfile?.(`World.autosave:${this.name}`);
        try {
            if (this.getTicks() % World.AUTO_SAVE_INTERVAL_TICKS === 0) this.beginAutoSave();
        } finally {
            endAutoSaveProfile?.();
        }

        // Before the entities, so a mob walks on the world as it is this tick rather than as it was
        // before the sand under it fell away.
        const endBlockUpdatesProfile = startProfile?.(`World.blockUpdates:${this.name}`);
        try {
            // Light outside the simulation ring is initialized on demand when something reads it,
            // and the ring's own flood finishes over the ticks that follow. Simulation does not
            // wait for it: a join queues tens of millions of light nodes at 4096 a tick, so waiting
            // froze every entity, spawner and furnace for minutes (the client e2e scenarios caught
            // players that never landed, furnaces that never lit and cows that never spawned).
            this.systems.prepareLighting?.();
            await this.runBlockUpdates();
        } finally {
            endBlockUpdatesProfile?.();
        }

        // Java's order: the two scheduled tick lists, then the chunk tick that draws the random
        // positions, then the light the writes above queued. Budgeted, so one tick cannot stall
        // on a light flood or a backlog of fluid ticks. The weather cycle ran before this, on
        // the level, as `ServerLevel.tick` runs `advanceWeatherCycle` before its tick lists.
        const endSystemsProfile = startProfile?.(`World.systems:${this.name}`);
        try {
            this.systems.tick(this.getTicks());
            this.getRaidManager()?.tick();
        } finally {
            endSystemsProfile?.();
        }

        const playerChunkRefCounts = this.getPlayerChunkRefCounts();
        playerChunkRefCounts.synchronize(this.players);
        this.tickCookingStations(playerChunkRefCounts);
        this.tickSpawners(playerChunkRefCounts);
        const isPositionTicking = (x: number, z: number): boolean =>
            playerChunkRefCounts.simulates(CoordinateUtils.fromBlockToChunk(x), CoordinateUtils.fromBlockToChunk(z));

        // Claimed per tick, so an entity that arrived from a world the level ticked earlier
        // this pass is not updated twice: see {@link Entity.claimUpdate}. Taken from the map
        // into the one list the loop below walks, because an update can add or remove entities.
        // No index is rebuilt here: the entity index is refiled on every position write, so a
        // query sees each entity where its last write put it (ADR 0007).
        const tickingEntities: Entity[] = [];
        for (const entity of this.entities.values()) {
            if (!(entity instanceof Player)) {
                const position = entity.getPosition();
                if (!isPositionTicking(position.getX(), position.getZ())) continue;
            }
            if (entity.claimUpdate(tick)) tickingEntities.push(entity);
        }

        // Before the updates, so the contact an entity's own update advances this tick already
        // knows whether it stood in a portal, as Java's `checkInsideBlocks` runs inside `tick`
        // before `handlePortal`.
        const endPortalContactsProfile = startProfile?.(`World.portalContacts:${this.name}`);
        try {
            await this.touchPortals(tickingEntities);
        } finally {
            endPortalContactsProfile?.();
        }

        // Before the entity updates, as Java's `ServerLevel.tick` runs the fight before the
        // entities, so a dragon the fight spawns this tick stands in the world its first update
        // reads. A dimension without a fight skips this on one flag read.
        const endDragonFightProfile = startProfile?.(`World.dragonFight:${this.name}`);
        try {
            await this.getDragonFight()?.tick();
        } finally {
            endDragonFightProfile?.();
        }

        const endEntityUpdatesProfile = startProfile?.(`World.entityUpdates:${this.name}`);
        try {
            // Java completes each entity's tick callback before visiting the next ID. These
            // updates are asynchronous in JS, so awaiting each one prevents overlapping mutations
            // (such as two item entities merging and both being collected) from making replay
            // outcomes depend on promise scheduling.
            for (const entity of tickingEntities) await entity.update(tick);
        } finally {
            endEntityUpdatesProfile?.();
        }

        // The data-driven entities, after the written ones: a data entity's body is a
        // `GenericEntity` whose own update does nothing, so the loop above has already run the
        // half of it that the class hierarchy owns and this runs the half the components do.
        // The spawn and despawn cycle runs inside this tick, with Bedrock's caps and cadences
        // and the sixty vanilla spawn rules, through `@jsprismarine/spawning`.
        const endDataEntitiesProfile = startProfile?.(`World.dataEntities:${this.name}`);
        try {
            await this.dataEntities().tick(tick, ({ x, z }) => isPositionTicking(x, z));
        } finally {
            endDataEntitiesProfile?.();
        }

        // Straight after the updates that changed them, and before anything else can add a body
        // whose attributes have not been touched yet. Read again rather than reused: the spawn
        // cycle above has put bodies in the world since the list was taken.
        const endAttributesProfile = startProfile?.(`World.entityAttributes:${this.name}`);
        try {
            await this.flushEntityAttributes(this.getEntities());
        } finally {
            endAttributesProfile?.();
        }

        // After everything has moved but before the movement goes out, so an entity that came
        // into range this tick is spawned before the first packet that says it moved.
        const endTrackingProfile = startProfile?.(`World.entityTracking:${this.name}`);
        try {
            await this.updateTracking(tick);
        } finally {
            endTrackingProfile?.();
        }

        // After physics and after the entities, both of which change blocks, so a tick's block
        // changes leave as one batch per player rather than one packet each - see
        // `flushBlockChanges`. Before the movement, so a mob is not reported walking on ground the
        // client has not been told about yet.
        const endBlockChangesProfile = startProfile?.(`World.blockChanges:${this.name}`);
        try {
            await this.changes.flushBlockChanges();
        } finally {
            endBlockChangesProfile?.();
        }

        // After the block changes, never before them. A client drops a block entity update for
        // a position it has no block entity at, and an `UpdateBlockPacket` landing afterwards
        // makes it rebuild the block entity from its own empty data - so a chest placed and
        // filled in one tick has to be announced as a block first.
        const endBlockEntitiesProfile = startProfile?.(`World.blockEntities:${this.name}`);
        try {
            await this.changes.flushBlockEntities();
        } finally {
            endBlockEntitiesProfile?.();
        }

        // After every entity has moved, so a tick's movement leaves as one batch per player rather
        // than one per mob - see `flushMovement`.
        const endMovementProfile = startProfile?.(`World.movement:${this.name}`);
        try {
            await this.flushMovement();
        } finally {
            endMovementProfile?.();
        }

        const endTimeProfile = startProfile?.(`World.time:${this.name}`);
        try {
            await this.sendTime();
        } finally {
            endTimeProfile?.();
        }

        const endUnloadProfile = startProfile?.(`World.unloadChunks:${this.name}`);
        try {
            this.beginDistantChunkUnloads();
        } finally {
            endUnloadProfile?.();
        }

        // Drain the per-session fallback queues once all tick-driven traffic, including
        // movement and time, has had a chance to join the same outbound batch.
        await Promise.all(
            this.getPlayers().map((player) => player.getNetworkSession().getConnection().flushOutboundPackets())
        );
    }

    /**
     * Returns a block instance in the given world position.
     * @param {number} x - block x
     * @param {number} y - block y
     * @param {number} z - block z
     * @param {number} [layer=0] - block storage layer (0 for blocks, 1 for liquids)
     */
    /**
     * The exact block state at a position, properties included.
     *
     * `getBlock` answers "which block is this", collapsing every state of it onto one
     * `Block`. Anything the client resolves by runtime id - break sounds, destroy
     * particles - needs the state itself, because that is what the id identifies.
     */
    public async getBlockState(x: number, y: number, z: number, layer = 0): Promise<BlockState> {
        return (await this.getChunkAt(x, z)).getBlock(x, y, z, layer);
    }

    /**
     * The block at a position, carrying the state the chunk holds.
     *
     * Every one of the palette's 22079 states resolves, because the names a chunk can hold
     * come out of the same content build this method reads. The properties travel
     * with the name, so a lit lamp, a half slab and a stair on its side each read their own
     * facts rather than the ones their default state has.
     * @throws When no registry names the block the chunk holds, which is a corrupt chunk or
     * a world saved against a plugin that is no longer loaded. This used to answer air,
     * and air is a position a caller is free to build in, so the block was lost on the next
     * write.
     */
    public async getBlock(x: number, y: number, z: number, layer = 0): Promise<Block> {
        const state = (await this.getChunkAt(x, z)).getBlock(x, y, z, layer);
        const block = blockFromContent(state.name, this.server.getContent(), state.properties);
        if (!block) {
            throw new Error(`No block named ${state.name}, held at ${x} ${y} ${z} in world ${this.getName()}`);
        }

        return block;
    }

    /**
     * Returns the chunk in the specifies x and z, if the chunk doesn't exists
     * it is generated.
     *
     * @param options - How badly the chunk is wanted. Defaults to `immediate`, which is what a
     * caller that is about to read blocks out of it means.
     */
    public async getChunk(cx: number, cz: number, options?: ChunkRequestOptions): Promise<Chunk> {
        const index = Chunk.packXZ(cx, cz);
        // The light engine needs a newly inserted chunk in the world map while it initializes
        // it. Keep callers on the load promise until that completion finishes, so a client
        // cannot send the chunk in the gap before its light is ready.
        if (this.loading.has(index)) return this.loadChunk(cx, cz, options);
        if (!this.chunks.has(index)) return this.loadChunk(cx, cz, options);

        return this.chunks.get(index)!;
    }

    /**
     * The chunk at a coordinate if it is already in memory, and null otherwise.
     *
     * The synchronous counterpart to {@link getChunk}, which mob AI needs: pathfinding reads a few
     * hundred blocks to plan one route and has to answer inside the tick, and `getChunk` would both
     * make that asynchronous and quietly generate terrain as a mob walked towards it.
     * The last answer is remembered, because the callers ask in runs: the light engine scans a
     * column of 384 blocks, and a path finder reads a few hundred around one position, each
     * through this. The cache is one entry and is dropped whenever {@link chunks} gains or loses
     * one, so the only way to make it lie is to change the map without going through the load or
     * unload path.
     * @param {number} cx - Chunk x.
     * @param {number} cz - Chunk z.
     * @returns {Chunk | null} The loaded chunk, or null - never a generated one.
     */
    public getLoadedChunk(cx: number, cz: number): Chunk | null {
        const index = Chunk.packXZ(cx, cz);
        // The map identity too: a test swaps `chunks` wholesale on a live world.
        if (index === this.lastChunkIndex && this.chunks === this.lastChunkSource) return this.lastChunk;

        const chunk = this.chunks.get(index) ?? null;
        this.lastChunkIndex = index;
        this.lastChunkSource = this.chunks;
        this.lastChunk = chunk;
        return chunk;
    }

    /** The latest block-write version, unique across world instances and monotonic per world. */
    public getBlockWriteVersion(): number {
        return this.blockWriteVersion;
    }

    /** How many chunks are in memory, which is what the mob spawner budgets against. */
    public getLoadedChunkCount(): number {
        return this.chunks.size;
    }

    /**
     * Generates the chunks around spawn before the world opens for business.
     *
     * Centered on spawn, because the point is to have ready what the first player will
     * actually see - the previous version walked a square from chunk (0,0) outwards, which
     * for a spawn anywhere else was mostly work nobody would ever look at.
     *
     * Loading happens in batches with a yield between them. Chunk generation is synchronous,
     * so without that the event loop would be blocked for the whole preload: no progress
     * could be drawn, and the RakNet socket would not answer a single packet meanwhile.
     *
     * A shutdown interrupts it inside a batch rather than between batches. The whole batch is
     * asked for in one turn and the generator answers one chunk at a time, so stopping only at
     * the edge meant waiting out thirty-two chunks of terrain - about fifteen seconds - for a
     * world that was closing. {@link GeneratorFactories.stopGenerating} drops what the generator
     * has not started and each of those requests arrives back here as a {@link
     * GenerationStopped}. Whatever was generated by then is saved; the rest is generated on
     * demand next time, which is what an unpreloaded chunk does anyway.
     */
    private async preloadSpawnRegion(): Promise<void> {
        const radius = this.server.getConfig().getPreloadRadius();
        if (radius <= 0) return;

        const spawn = await this.getSpawnPosition();
        const centerX = CoordinateUtils.fromBlockToChunk(spawn.getX());
        const centerZ = CoordinateUtils.fromBlockToChunk(spawn.getZ());

        const coordinates: Array<[number, number]> = [];
        for (let x = centerX - radius; x <= centerX + radius; x++) {
            for (let z = centerZ - radius; z <= centerZ + radius; z++) {
                coordinates.push([x, z]);
            }
        }

        this.server.getLogger().info(`Preparing start region for dimension ${this.getFormattedName()}`);
        const progress = new Progress(`Preparing ${this.getFormattedName()}`, coordinates.length, (line) =>
            this.server.getLogger().info(line)
        );

        let prepared = 0;
        for (let i = 0; i < coordinates.length; i += PRELOAD_BATCH_SIZE) {
            if (this.closing) {
                progress.finish(`the world is closing, stopped at ${prepared} of ${coordinates.length}`);
                return;
            }

            const batch = coordinates.slice(i, i + PRELOAD_BATCH_SIZE);
            const loaded = await Promise.all(batch.map(async ([x, z]) => this.preloadChunk(x, z)));
            const done = loaded.filter((generated) => generated).length;
            prepared += done;

            progress.advance(done);
            if (done < batch.length) {
                progress.finish(`the world is closing, stopped at ${prepared} of ${coordinates.length}`);
                return;
            }

            // Hand the loop back so the bar paints and the socket stays responsive.
            await new Promise((resolve) => setImmediate(resolve));
        }

        progress.finish();
    }

    /**
     * Loads one chunk of the start region, or reports that the generator has stopped.
     *
     * @param x - Chunk x.
     * @param z - Chunk z.
     * @returns True when the chunk is in memory, false when a shutdown gave up on it.
     * @throws Whatever the provider threw for any other reason. A start region that cannot be
     * generated is a real fault and belongs to whoever awaited {@link World.enable}.
     */
    private async preloadChunk(x: number, z: number): Promise<boolean> {
        try {
            // Nobody is waiting on the start region: a chunk it does not reach is generated on
            // demand instead, so a player who connects mid-preload should be served first and
            // the rest of the region should fill in behind them.
            await this.loadChunk(x, z, { urgency: 'idle' });
            return true;
        } catch (error: unknown) {
            if (error instanceof GenerationStopped) return false;
            throw error;
        }
    }

    /**
     * Loads a chunk in a given x and z and returns its.
     *
     * A request for a chunk that is already being loaded joins that one rather than starting a
     * second. They arrive together constantly - the preload asks for a batch of thirty-two in
     * one turn, and every player whose view distance reaches a chunk asks for it as well - and
     * each duplicate was a whole chunk generated and then thrown away, because the last one to
     * finish overwrote the others in the map. Worse than wasted: two callers held two different
     * objects for one position, so a block written into one was invisible through the other.
     *
     * @param {number} x - x coordinate.
     * @param {number} z - z coordinate.
     * @param options - How badly the chunk is wanted. A caller that joins a load already in
     * flight and wants it more than whoever started it moves that load up the generator's
     * queue, so a chunk asked for as the far rim and then stood on does not keep the turn it
     * was given when nobody needed it.
     * @throws {Error} When the world has been closed, since its provider is gone and a chunk
     * generated now would be generated after the save that was meant to persist it.
     */
    public async loadChunk(x: number, z: number, options?: ChunkRequestOptions): Promise<Chunk> {
        // Refused here rather than left to the provider, which answers with "The world
        // provider is not enabled" - the symptom, not the reason. The caller asked a world
        // that has shut down for a chunk, and that is what it should be told.
        if (this.level.isClosed()) throw new Error(`Cannot load chunk ${x},${z}: world ${this.name} has been closed`);

        const index = Chunk.packXZ(x, z);
        const running = this.loading.get(index);
        if (running !== undefined) {
            const urgency = options?.urgency ?? 'immediate';
            const priorities = ['immediate', 'soon', 'idle'] as const;
            if (priorities.indexOf(urgency) < priorities.indexOf(running.urgency.value)) {
                running.urgency.value = urgency;
                this.generator.raiseUrgency?.(x, z, urgency);
                this.admissions?.promote(this.chunkAdmission('enter', x, z), urgency);
            }
            // Code inside the tick that waits for a chunk the tick cannot run without. Holding it
            // for the next input step would leave the tick unable to finish, so it is admitted the
            // moment it is ready. A path that still breaks the admission rule, and the queue
            // counts it; see `inTickChunkLoads.ts`.
            if (insideTick()) {
                running.wantedBy = currentTickScope();
                if (running.parked) this.admissions?.admitNow(this.chunkAdmission('enter', x, z));
            }
            return this.awaitLoad(running);
        }

        // The entry is dropped whether the load worked or not, so a chunk whose provider threw
        // is asked for again next time rather than handing out the same failure forever.
        const state: ChunkLoadState = {
            urgency: { value: options?.urgency ?? 'immediate' },
            parked: false,
            waiters: [],
            wantedBy: currentTickScope()
        };
        const load: ChunkLoad = Object.assign(state, { chunk: this.readChunkInto(index, x, z, options, state) });
        this.loading.set(index, load);
        try {
            return await this.awaitLoad(load);
        } finally {
            this.loading.delete(index);
        }
    }

    /**
     * Waits for a load, and while the load waits only for an input step, tells the caller's
     * tracker that its work is parked on a tick ({@link trackTickWaits}).
     */
    private async awaitLoad(load: ChunkLoad): Promise<Chunk> {
        const tracker = currentTickWaitTracker();
        if (tracker === undefined) return load.chunk;

        load.waiters.push(tracker);
        if (load.parked) tracker.park();
        try {
            return await load.chunk;
        } finally {
            load.waiters.splice(load.waiters.indexOf(tracker), 1);
            if (load.parked) tracker.unpark();
        }
    }

    /** The admission queue chunks wait in, when the ticker runs one. */
    private get admissions(): ChunkAdmissionScheduler | undefined {
        return this.completionQueue?.admissions;
    }

    /** One of this world's chunks entering or leaving it, as the admission queue names it. */
    private chunkAdmission(change: ChunkAdmission['change'], x: number, z: number): ChunkAdmission {
        return { world: chunkAdmissionWorld(this.name, this.dimension.name), change, x, z };
    }

    /**
     * Gives the fluid of a loaded chunk that borders air a tick, so water over an empty cave falls
     * and a lake edge spreads instead of hanging there; see {@link exposedFluidsOf}.
     */
    private scheduleExposedFluids(chunk: Chunk): void {
        const exposed = exposedFluidsOf(chunk);
        if (exposed.length === 0) return;

        const fluidTicks = this.systems.ticks.list('fluid');
        const now = this.getTicks();
        for (const fluid of exposed) {
            const at = { x: chunk.getX() * 16 + fluid.x, y: fluid.y, z: chunk.getZ() * 16 + fluid.z };
            fluidTicks.schedule(
                at,
                fluid.name,
                now + (fluid.name.endsWith('lava') ? LAVA_SPREAD_TICKS : WATER_SPREAD_TICKS)
            );
        }
    }

    /** The body of {@link World.loadChunk}, once it is this call's job to do the loading. */
    private async readChunkInto(
        index: number,
        x: number,
        z: number,
        options: ChunkRequestOptions | undefined,
        load: ChunkLoadState
    ): Promise<Chunk> {
        // Try - catch for provider errors
        const chunk = await this.getProvider().readChunk(
            this.dimension,
            x,
            z,
            this.level.seed,
            this.generator,
            this.config,
            options
        );

        let discardedStacklessItems = false;
        const enter = async (): Promise<boolean> => {
            discardedStacklessItems = await this.enterChunk(index, chunk);
            return true;
        };
        const admissions = this.admissions;
        if (admissions === undefined) {
            await enter();
        } else {
            // The chunk is ready, and it enters the world only when the input step admits it
            // (ADR 0009), so no tick sees the loaded set change in its middle. A tick that waits
            // for it cannot end before it enters, so that one is admitted now.
            const now = insideTick() || load.wantedBy?.open === true;
            this.parkLoad(load, admissions.isActive && !now);
            try {
                await admissions.hold(
                    {
                        ...this.chunkAdmission('enter', x, z),
                        priority: load.urgency.value,
                        content: () => chunk.networkSerialize(),
                        apply: enter
                    },
                    now
                );
            } finally {
                this.parkLoad(load, false);
            }
        }

        if (discardedStacklessItems && this.getProvider().supportsChunkUnload === true) {
            try {
                await this.enqueueSave(async () => {
                    this.dataEntities().persist();
                    await this.getProvider().writeChunk(chunk);
                });
            } catch (error: unknown) {
                this.server
                    .getLogger()
                    .error(`Failed to remove stackless item actors from chunk ${chunk.getX()},${chunk.getZ()}`);
                this.server.getLogger().error(error);
            }
        }

        // TODO: event here, eg onChunkLoad
        return chunk;
    }

    /** Marks a load as waiting for the input step, or as no longer waiting, for its waiters. */
    private parkLoad(load: ChunkLoadState, parked: boolean): void {
        if (load.parked === parked) return;
        load.parked = parked;
        for (const waiter of load.waiters) {
            if (parked) waiter.park();
            else waiter.unpark();
        }
    }

    /**
     * Puts a ready chunk into the world: registers it, lights it, schedules the fluid that
     * borders air and creates its entities. What an admitted chunk completion applies.
     *
     * @returns Whether a stored item without a stack was dropped, which the caller saves.
     */
    private async enterChunk(index: number, chunk: Chunk): Promise<boolean> {
        const x = chunk.getX();
        const z = chunk.getZ();
        // The provider has completed generation or disk decoding; keep its mutable write fast path
        // out of the final retained form and pack each section before it enters the loaded world.
        this.measured('chunk-register', () => {
            chunk.packBlockStorage();
            this.chunks.set(index, chunk);
            this.loadedChunksRevision++;
            this.getPlayerChunkRefCounts().chunkLoaded(chunk);
            this.getPortalIndex().chunkLoaded(chunk);
            this.server.invalidateEntityBlockCaches?.(this.dimension.name, x, z);
            // The only thing that changes what `getLoadedChunk` should answer.
            this.lastChunkIndex = -1;
            this.markEntitiesInChunkChanged(chunk);
        });

        // After the chunk is in the map: the engine reads the blocks back through the world.
        this.measured('chunk-lighting', () => this.systems.onChunkLoaded(x, z));
        this.measured('chunk-fluids', () => this.scheduleExposedFluids(chunk));

        return this.measuredAsync('chunk-entities/wall', async () => {
            const discarded = await this.createStoredEntities(chunk);
            await this.createGeneratedEntities(chunk);
            return discarded;
        });
    }

    /** Books a synchronous piece of chunk completion under a label, when the scheduler does accounting. */
    private measured<T>(label: string, work: () => T): T {
        const queue = this.completionQueue;
        return queue?.measure === undefined ? work() : queue.measure(label, work);
    }

    /**
     * Books the wall time of an asynchronous piece, from its start to its settling.
     *
     * Includes any time spent suspended, so it reads as main-thread time only for a piece whose
     * awaits resolve without waiting on I/O, which is the case for the entity registration this
     * is used on. The label says `wall` so a reader does not take it for a CPU figure.
     */
    private async measuredAsync<T>(label: string, work: () => Promise<T>): Promise<T> {
        const queue = this.completionQueue;
        if (queue?.record === undefined) return work();

        const startedAt = performance.now();
        try {
            return await work();
        } finally {
            queue.record(label, performance.now() - startedAt);
        }
    }

    /** Restores the actor NBT the provider read for this chunk. */
    private async createStoredEntities(chunk: Chunk): Promise<boolean> {
        let discardedStacklessItems = false;

        for (const nbt of chunk.takeStoredEntities()) {
            if (nbt.getString('identifier', '') === 'minecraft:player') continue;

            const entity = EntitySerializer.fromNBT(nbt, this);
            if (entity instanceof ItemEntity && entity.getItem() === undefined) {
                this.server
                    .getLogger()
                    .warn(`Skipped dropped item without a stack in chunk ${chunk.getX()},${chunk.getZ()}`);
                chunk.markChanged();
                discardedStacklessItems = true;
                continue;
            }

            // Before the restore, not after: providers without actor storage may keep a
            // lightweight entity snapshot, which the full actor record replaces on load.
            const legacyEntity = this.getEntities().find((candidate) => this.isLegacyEntity(candidate, entity));
            if (legacyEntity) await this.removeEntity(legacyEntity);

            if (this.restoreDataEntity(entity)) continue;

            await this.addEntity(entity);
        }

        return discardedStacklessItems;
    }

    /**
     * Hands a saved entity back to the data-driven runtime when its pack type is available.
     *
     * Without this a mob that was running its components, goals and brain came
     * back as a body with none of them behind it, and the spawn loop counted
     * nothing against the population cap it had been spawned under, so a
     * reloaded world over-spawned.
     *
     * @param stored - The body built from the actor NBT, which the runtime
     *   reads the position and the untouched tags off and then replaces.
     * @returns Whether the runtime took it. False means this world runs the
     *   written entity classes, the actor is a dropped item, the world has no data runtime, or
     *   no loaded pack declares its type, and the caller adds the body it built.
     */
    private restoreDataEntity(stored: Entity, live = this.server.getEntityRuntime?.(this.dimension.name)): boolean {
        if (live === undefined) return false;

        const record = stored.persistentNbt === null ? undefined : dataEntityRecordIn(stored.persistentNbt);
        if (record !== undefined) return live.restore(record, stored) !== undefined;

        return !(stored instanceof ItemEntity) && live.restoreExisting(stored) !== undefined;
    }

    private isLegacyEntity(candidate: Entity, stored: Entity): boolean {
        if (candidate.persistentNbt !== null || candidate.getType() !== stored.getType()) return false;

        const candidatePosition = candidate.getPosition();
        const storedPosition = stored.getPosition();
        return (
            Math.fround(candidatePosition.getX()) === Math.fround(storedPosition.getX()) &&
            Math.fround(candidatePosition.getY()) === Math.fround(storedPosition.getY()) &&
            Math.fround(candidatePosition.getZ()) === Math.fround(storedPosition.getZ())
        );
    }

    /**
     * Creates the mobs world generation left in a chunk.
     *
     * The generator has no world to add entities to - it builds chunks, and a chunk may be
     * generated long before anything asks for it - so it records what should be there and this acts
     * on it. Draining rather than reading means a chunk that has already been populated has nothing
     * left to hand over, so unloading and reloading an area cannot breed a second village worth of
     * villagers.
     * @param {Chunk} chunk - The chunk that was just loaded.
     */
    private async createGeneratedEntities(chunk: Chunk): Promise<void> {
        const spawns = chunk.takeEntitySpawns();
        if (spawns.length === 0) return;

        for (const spawn of spawns) {
            // Java world generation writes mobs and structure actors, never dropped stacks.
            // A generated item has no loot payload and would otherwise live forever without
            // anything for the player to pick up.
            if (spawn.type === ItemEntity.MOB_ID) continue;

            const at = { x: spawn.x, y: spawn.y, z: spawn.z };

            // A generated mob gets its components, brain and trades from the data runtime.
            const live = this.dataEntities();
            if (live.runtime.content().entities.registry.has(spawn.type)) {
                live.runtime.spawn(spawn.type, at, {
                    yaw: spawn.yaw ?? 0,
                    pitch: 0,
                    ...(spawn.beamTarget === undefined ? {} : { beamTarget: spawn.beamTarget }),
                    ...(spawn.showBottom === undefined ? {} : { showBottom: spawn.showBottom }),
                    ...(spawn.invulnerable === undefined ? {} : { invulnerable: spawn.invulnerable })
                });
                continue;
            }

            this.server.getLogger().debug(`World generation asked for ${spawn.type}, which no data runtime declares`);
        }
    }

    /**
     * Sends a world event packet to all the viewers in the position chunk.
     * @param {Vector3} position - world position.
     * @param {number} event - event identifier.
     * @param {number} data - event data.
     */
    public async sendWorldEvent(position: Vector3 | null, event: LevelEvent, data: number): Promise<void> {
        this.changes.worldEffect(position, event, data);
    }

    /**
     * A noise one entity made: being hit, dying, swinging at something.
     * @param {Entity} entity - Who made it.
     * @param {LevelSoundEvent} sound - Which noise.
     */
    public async sendActorSound(entity: Entity, sound: LevelSoundEvent): Promise<void> {
        this.changes.actorSound(entity, sound);
    }

    /**
     * Tells everyone watching that an entity now looks different.
     * @param {Entity} entity - Who changed.
     */
    public async sendActorMetadata(entity: Entity): Promise<void> {
        await this.changes.entityMetadataChanged(entity);
    }

    /**
     * Tells everyone watching that an entity is holding or wearing something new.
     *
     * Called from the one place equipment is written, `entity/data/liveBodies.ts`, which has
     * already dropped the writes that changed nothing.
     * @param {Entity} entity - Whose equipment changed.
     */
    public entityEquipmentChanged(entity: Entity): void {
        void this.changes
            .entityEquipmentChanged(entity)
            .catch((error: unknown) => this.server.getLogger().error(error));
    }

    /**
     * One swing against a block: the sound of the hit and the chips that come off it.
     *
     * Struck, not broken. `START_BLOCK_CRACKING` was the only thing sent while mining, and
     * that is the progress overlay - it draws the cracks spreading and makes no sound at all,
     * which is why digging was silent until the block gave way.
     *
     * The material comes from the runtime id, the same way a break's destroy event gets it: the
     * client looks the block up and plays whatever that block is made of.
     *
     * The sound goes to everyone near but the one striking, whose client plays its own hits in
     * either breaking mode. A Bedrock Dedicated Server 1.26.52 sends the striker none. This one
     * reached them too, and with their client's own hits it sounded like digging at several
     * times the speed.
     * @param {Vector3} position - The block being struck.
     * @param {number} face - Which side was hit; the chips come off that one.
     * @param {Player} [striker] - Who is striking it, when a player is.
     */
    public async hitBlock(position: Vector3, face: number, striker?: Player): Promise<void> {
        const state = await this.getBlockState(position.getX(), position.getY(), position.getZ());
        if (state.name === 'minecraft:air') return;

        const runtimeId = BlockRuntimeIds.get(state);

        this.changes.blockSound(position, LevelSoundEvent.HIT, runtimeId, striker);

        const particles = CRACK_PARTICLES[face];
        if (particles !== undefined) await this.sendWorldEvent(position, particles, runtimeId);
    }

    /**
     * Starts the crack animation on a block a player began mining, as a Bedrock Dedicated
     * Server does with server-authoritative block breaking.
     *
     * The cracks on whatever the player mined before stop first, then start on this block with
     * the progress a tick is worth. They continue every tick through
     * {@link World.updateBlockCracking} until the block breaks or the player stops.
     * @param {Vector3} position - The block being mined.
     * @param {number} face - The face being mined, which decides where the particles fly.
     * @param {Item | null} tool - What the player holds, or null for a bare hand.
     * @param {BlockMining | null} previous - What the player was mining until now. When it is
     * this same block, the mining carries on from when it began rather than starting over.
     * @returns {Promise<BlockMining | null>} What the player is mining now, or null for air and
     * for a block that breaks at once, which have nothing to animate.
     */
    public async startBlockCracking(
        position: Vector3,
        face: number,
        tool: Item | null,
        previous: BlockMining | null
    ): Promise<BlockMining | null> {
        if (previous !== null) await this.stopBlockCracking(previous.position);

        const state = await this.getBlockState(position.getX(), position.getY(), position.getZ());
        if (state.name === 'minecraft:air') return null;

        const block = await this.getBlock(position.getX(), position.getY(), position.getZ());
        const breakTicks = Math.ceil(block.getBreakTime(tool, this.server) * 20);

        // A block that gives way instantly has no progress to animate, and the 65535/0 the
        // client would be handed is not a number this event can carry.
        if (breakTicks <= 0) return null;

        const runtimeId = BlockRuntimeIds.get(state);
        // A client restarts the cracks on the block it is already mining, sometimes in the
        // same input as the prediction that it broke, and that must not reset the time it took.
        const sameBlock = previous !== null && previous.position.equals(position) && previous.runtimeId === runtimeId;
        const mining: BlockMining = {
            position,
            face,
            runtimeId,
            // The client is told how much progress a tick is worth, not how long the block takes.
            progressPerTick: Math.floor(65535 / breakTicks),
            breakTicks,
            startedAt: sameBlock ? previous.startedAt : this.server.getTick()
        };

        await this.sendWorldEvent(position, LevelEvent.START_BLOCK_CRACKING, mining.progressPerTick);
        return mining;
    }

    /**
     * One tick of mining: the particles off the face being mined, then the crack progress.
     *
     * A Bedrock Dedicated Server sends this pair every tick for as long as a block is being
     * mined. The particles leave from the block's center and carry its runtime id, which the
     * client textures them with. The progress goes to the block's corner, like the start and
     * the stop.
     *
     * The block can change while it is mined: another player breaks it, or a command or a flood
     * replaces it. The cracks belonged to the block that was there, so they stop with it.
     * @param {BlockMining} mining - What is being mined.
     * @returns {Promise<boolean>} False when the block is no longer the one being mined, in
     * which case its cracks were stopped and nothing else was sent.
     */
    public async updateBlockCracking(mining: BlockMining): Promise<boolean> {
        const { position, face, runtimeId, progressPerTick } = mining;

        if (this.loadedBlockRuntimeIdAt(position.getX(), position.getY(), position.getZ()) !== runtimeId) {
            await this.stopBlockCracking(position);
            return false;
        }

        const particles = CRACK_PARTICLES[face];
        if (particles !== undefined) {
            await this.sendWorldEvent(
                new Vector3(position.getX() + 0.5, position.getY() + 0.5, position.getZ() + 0.5),
                particles,
                runtimeId
            );
        }
        await this.sendWorldEvent(position, LevelEvent.UPDATE_BLOCK_CRACKING, progressPerTick);
        return true;
    }

    /**
     * Ends the crack animation on a block, as when the player stops mining it or moves on.
     * @param {Vector3} position - The block.
     */
    public async stopBlockCracking(position: Vector3): Promise<void> {
        await this.sendWorldEvent(position, LevelEvent.STOP_BLOCK_CRACKING, 0);
    }

    /**
     * Tells everyone watching that something happened to one entity - it was hurt, it died,
     * it swung an arm. The client plays the animation and the sound that go with it.
     * @param {Entity} entity - The entity it happened to.
     * @param {ActorEvent} event - What happened.
     * @param {number} [data=0] - Extra detail, for the events that carry any.
     */
    public async sendActorEvent(entity: Entity, event: ActorEvent, data = 0): Promise<void> {
        await this.changes.actorEffect(entity, event, data);
    }

    /**
     * Tells clients tracking an entity about one status effect change.
     * @param {Entity} entity - The actor whose effect changed.
     * @param {StatusEffect} effect - The effect state.
     * @param {StatusEffectChange} change - Whether it was added, updated, or removed.
     */
    public async sendStatusEffect(entity: Entity, effect: StatusEffect, change: StatusEffectChange): Promise<void> {
        await this.changes.statusEffectChanged?.(entity, effect, change);
    }

    /**
     * Returns a chunk from a block position's x and z coordinates.
     */
    public async getChunkAt(x: Vector3): Promise<Chunk>;
    public async getChunkAt(x: number, z: number): Promise<Chunk>;
    public async getChunkAt(x: Vector3 | number, z: number = 0): Promise<Chunk> {
        if (x instanceof Vector3) {
            return this.getChunkAt(x.getX(), x.getZ());
        }

        return this.getChunk(x >> 4, z >> 4);
    }

    /**
     * Returns the world spawn, in block coordinates.
     *
     * The height is the one `level.dat` stores, which is one block below where a player's feet
     * go: see {@link placePlayerSpawn} for where a player actually starts.
     */
    public async getSpawnPosition(): Promise<Vector3> {
        const known = this.getKnownSpawnPosition();
        if (known) return known;

        const found = await this.findSurfaceSpawn();
        this.setSpawnPosition(found);
        return found;
    }

    /**
     * Looks outward from the origin for dry ground to stand on.
     *
     * A quarter of this world is ocean, so the origin column is quite likely to be water -
     * and the topmost block of a flooded column *is* water, which is what makes the test
     * for it as simple as it looks.
     *
     * The search widens in rings and steps several blocks at a time, because terrain does not
     * change meaningfully between neighbors. How much each candidate costs is the whole of this
     * method's performance: a seed whose origin is open ocean walks thousands of candidates
     * before it reaches a shore, so asking each one for a finished chunk is what turns a boot
     * into a wait of many minutes. {@link Generator.surfaceAt} answers the same question from
     * the bare terrain without generating anything.
     */
    private async findSurfaceSpawn(): Promise<Vector3> {
        const chooseChunk = this.generator.spawnChunk;
        if (chooseChunk !== undefined) {
            const selected = chooseChunk.call(this.generator, this.level.seed);
            const chunk = await this.getChunk(selected.chunkX, selected.chunkZ);
            const standing = this.spawnSurfaceInChunk(chunk, selected.chunkX, selected.chunkZ);
            if (standing !== undefined) return new Vector3(standing.x, standing.y, standing.z);

            // The climate search chooses a chunk, not a block; keep the fallback inside that chunk.
            this.server
                .getLogger()
                .warn(
                    `No dry spawn found in chunk ${selected.chunkX},${selected.chunkZ} for ${this.getFormattedName()}`
                );
            return new Vector3(selected.chunkX * 16 + 8, 100, selected.chunkZ * 16 + 8);
        }

        for (let radius = 0; radius <= SPAWN_SEARCH_RADIUS; radius += SPAWN_SEARCH_STEP) {
            for (const [x, z] of World.ringAround(radius, SPAWN_SEARCH_STEP)) {
                const standing = await this.spawnSurfaceAt(x, z);
                if (standing === undefined) continue;

                // The surface block itself, which is how a Bedrock world stores it: players
                // are placed one block above the stored height.
                return new Vector3(x, standing, z);
            }
        }

        // Nowhere suitable within the search: better to start above the origin than to
        // refuse to start at all.
        this.server.getLogger().warn(`No dry spawn found for ${this.getFormattedName()}, falling back to the origin`);
        return new Vector3(0, 100, 0);
    }

    /**
     * Finds a dry top block inside Java's selected spawn chunk, without walking into neighbors.
     * Climate scoring selects the chunk; block state is only read after that chunk has been built.
     */
    private spawnSurfaceInChunk(
        chunk: Chunk,
        chunkX: number,
        chunkZ: number
    ): { readonly x: number; readonly y: number; readonly z: number } | undefined {
        for (let localX = 0; localX < 16; localX++) {
            for (let localZ = 0; localZ < 16; localZ++) {
                const x = chunkX * 16 + localX;
                const z = chunkZ * 16 + localZ;
                const y = chunk.getHighestBlockAt(x, z);
                if (y === null || UNSUITABLE_SPAWN_SURFACES.has(chunk.getBlock(localX, y, localZ).name)) continue;
                return { x, y, z };
            }
        }
        return undefined;
    }

    /**
     * The height a player could stand at in one column, or undefined when nothing could.
     *
     * Prefers the generator's terrain probe, which costs one column of noise. The fallback
     * generates the chunk and reads its topmost block, which is the only answer available from a
     * generator that has no cheaper one; it has to refuse leaves and flowers too, because a
     * finished chunk has them on top of the ground and a bare one never does.
     *
     * @param x - Block x.
     * @param z - Block z.
     */
    private async spawnSurfaceAt(x: number, z: number): Promise<number | undefined> {
        const probe = this.generator.surfaceAt;
        if (probe !== undefined) {
            const terrain = probe.call(this.generator, x, z, this.level.seed);
            return terrain === undefined || UNSUITABLE_SPAWN_TERRAIN.has(terrain.name) ? undefined : terrain.y;
        }

        const chunk = await this.getChunkAt(x, z);
        const y = chunk.getHighestBlockAt(x, z);
        if (y === null) return undefined;

        return UNSUITABLE_SPAWN_SURFACES.has(chunk.getBlock(x & 0xf, y, z & 0xf).name) ? undefined : y;
    }

    /**
     * The nearest structure whose name matches, or undefined when there is none in range.
     *
     * What `/locate structure` answers. Nothing is generated: the generator lays candidate
     * structures out against the bare noise terrain and reports where the nearest one starts,
     * so the search costs no chunks however far it reaches.
     *
     * @param name - What the player typed. See {@link structureNameMatches} for how loosely it
     * is read.
     * @param origin - Where to search from, in blocks.
     * @param radius - How far out to look, in rings of placement regions; Java's 100 by default.
     * @returns Java's locate position and the generation point, or undefined when the generator
     * places no structures, has no search of its own, or found nothing inside the radius.
     */
    public locateStructure(
        name: string,
        origin: { readonly x: number; readonly z: number },
        radius: number = LOCATE_RADIUS
    ): StructureSearchResult | undefined {
        const search = this.generator.locate;
        if (search === undefined) return undefined;

        // A tag the generator carries is read as Java reads it, by its members. One it does
        // not carry falls through to the name match, which is what makes Bedrock's `#village`
        // find the village variants on a generator without Java's tags.
        const tagged = name.startsWith('#')
            ? this.generator.membersOfTag?.('worldgen/structure', namespaced(name.slice(1)))
            : undefined;

        return search.call(this.generator, {
            x: Math.trunc(origin.x),
            z: Math.trunc(origin.z),
            radius,
            wanted:
                tagged === undefined
                    ? (structure) => structureNameMatches(name, structure)
                    : (structure) => tagged.has(structure),
            seed: this.level.seed
        });
    }

    /**
     * The nearest cell of a biome, or undefined when there is none within Java's reach.
     *
     * What `/locate biome` answers. Nothing is generated: the generator walks its climate
     * sampler outward from the origin on Java's grid, 6400 blocks out at one column per 32
     * blocks and one sample per 64 blocks of height.
     *
     * @param name - A biome identifier, with or without its `minecraft:` namespace, or a
     * `#tag` such as `#minecraft:is_ocean`.
     * @param origin - Where to search from, in blocks.
     * @returns The sampled position, or undefined when the generator has no biome walk of its
     * own, no biome by that name can occur here, or the radius held none.
     */
    public locateBiome(
        name: string,
        origin: { readonly x: number; readonly y: number; readonly z: number }
    ): BiomeSearchResult | undefined {
        const search = this.generator.locateBiome;
        if (search === undefined) return undefined;

        const tagged = name.startsWith('#')
            ? this.generator.membersOfTag?.('worldgen/biome', namespaced(name.slice(1)))
            : undefined;
        const wanted = namespaced(name.toLowerCase());

        return search.call(this.generator, {
            x: Math.trunc(origin.x),
            y: Math.trunc(origin.y),
            z: Math.trunc(origin.z),
            ...BIOME_SEARCH,
            wanted: tagged === undefined ? (biome) => biome === wanted : (biome) => tagged.has(biome),
            seed: this.level.seed
        });
    }

    /**
     * Where a player with no saved position starts, chosen the way a Bedrock Dedicated Server
     * chooses it.
     *
     * A block nothing registered a behavior for reads as air, so it does not obstruct.
     * @param random - picks the offset when the spawn has to move; for tests.
     */
    public async placePlayerSpawn(random?: RelocationOffset): Promise<PlayerSpawn> {
        const { minY, height } = this.dimension;
        const relocationOffset =
            random ??
            (() => Math.floor(this.server.getRandom()() * (SPAWN_RELOCATION_RANGE * 2 + 1)) - SPAWN_RELOCATION_RANGE);

        return placePlayerSpawn(
            await this.getSpawnPosition(),
            {
                minY,
                maxY: minY + height,
                isObstructed: async (x, y, z) => (await this.getBlock(x, y, z)).isSolid(),
                getBlockName: async (x, y, z) => (await this.getBlockState(x, y, z)).name,
                getHighestBlock: async (x, z) => (await this.getChunkAt(x, z)).getHighestBlockAt(x, z)
            },
            relocationOffset
        );
    }

    /** The positions at exactly `radius` from the origin, sampled every `step` blocks. */
    // `Generator` here would mean the world generator interface this file imports.
    private static *ringAround(radius: number, step: number): IterableIterator<[number, number]> {
        if (radius === 0) {
            yield [0, 0];
            return;
        }

        for (let offset = -radius; offset <= radius; offset += step) {
            yield [offset, -radius];
            yield [offset, radius];
            yield [-radius, offset];
            yield [radius, offset];
        }
    }

    /**
     * Set the world's spawn position. The Overworld's is the level's, Bedrock's `SpawnX/Y/Z`.
     * @param {Vector3} pos - The position.
     */
    public setSpawnPosition(pos: Vector3) {
        if (this.isOverworld()) this.level.setSpawn(pos);
        else this.spawn = pos;
    }

    /**
     * The spawn point if it has already been found, and null while it has not.
     *
     * {@link World.getSpawnPosition} searches for dry land the first time it is asked, which
     * is why it is asynchronous. A caller inside the tick cannot wait for that search, so it
     * gets what the world knows now. The Overworld answers the level's spawn, which is the
     * one the save keeps.
     * @returns {Vector3 | null} The spawn point, or null before it has been resolved.
     */
    public getKnownSpawnPosition(): Vector3 | null {
        return this.isOverworld() ? this.level.getSpawn() : this.spawn;
    }

    /** Whether this is the level's Overworld, whose spawn and legacy entities the save keeps. */
    private isOverworld(): boolean {
        return this.dimension.bedrockId === Dimensions.Overworld.bedrockId;
    }

    /**
     * Plays a sound at a block, named the way a resource pack spells it.
     *
     * The engine systems and the block behaviors name their sounds - `open.door`,
     * `random.chestopen`, `random.fizz` where lava meets water - and the level sound events
     * the rest of this world sends are numbers out of a fixed client enum with no entry for
     * most of them.
     * @param {number} x - Block x.
     * @param {number} y - Block y.
     * @param {number} z - Block z.
     * @param {string} sound - The sound definition's name.
     */
    public playNamedSound(x: number, y: number, z: number, sound: string): void {
        this.playNamedSoundAt(new Vector3(x + 0.5, y + 0.5, z + 0.5), sound);
    }

    /**
     * Plays a named sound at an exact world-space point.
     *
     * The counterpart of {@link World.playNamedSound} for things that are not blocks,
     * the way {@link World.spawnNamedParticleAt} is for particles: an entity's position
     * is already the point, so nothing centers it.
     * @param {Vector3} position - Where the sound plays.
     * @param {string} sound - The sound definition's name.
     * @param {NamedSoundOptions} [options] - Volume and pitch, when the definition's own are not wanted.
     */
    public playNamedSoundAt(position: Vector3, sound: string, options?: NamedSoundOptions): void {
        this.changes.namedSound(position, sound, options);
    }

    /**
     * Reports that the block entity at a position is now these tags.
     *
     * What makes this world a {@link import('../blockentity/blockEntityWrite').BlockEntityWorld},
     * so that every block entity write goes through one place and reaches the clients holding
     * the chunk. Called by `writeBlockEntity` and by nothing else: it reports rather than
     * writes, and calling it without having written the chunk tells a client something that
     * is not true.
     * @param {Vector3} position - The block the block entity sits in.
     * @param {NBTTagCompound} tags - Its complete data, as the chunk would serialize it.
     */
    public blockEntityChanged(position: Vector3, tags: NBTTagCompound): void {
        this.changes.worldChanged({ kind: 'block-entity-set', position, tags });
    }

    /**
     * Emits a named particle effect at a block, such as `minecraft:crop_growth_emitter`.
     *
     * The counterpart of {@link World.playNamedSound}: the hardcoded effects
     * {@link World.sendWorldEvent} carries are numbered, and the ones a behavior pack can
     * name are not.
     * @param {number} x - Block x.
     * @param {number} y - Block y.
     * @param {number} z - Block z.
     * @param {string} particle - The effect's identifier.
     */
    public spawnNamedParticle(x: number, y: number, z: number, particle: string): void {
        this.spawnNamedParticleAt(new Vector3(x + 0.5, y + 0.5, z + 0.5), particle);
    }

    /**
     * Emits a named particle effect at an exact world-space point.
     * @param {Vector3} position - Where the effect appears.
     * @param {string} particle - The effect's identifier.
     */
    public spawnNamedParticleAt(position: Vector3, particle: string): void {
        this.changes.namedParticle(position, particle);
    }

    /**
     * Tells the players who can see a block what is there, without changing it.
     *
     * For a client that predicted a change the server did not make: a refused placement leaves
     * the block that client drew on its screen until something else happens at the position.
     * Nothing is sent for a position whose chunk is not in memory or that lies outside the
     * dimension.
     * @param {number} x - Block x.
     * @param {number} y - Block y.
     * @param {number} z - Block z.
     */
    public resendBlock(x: number, y: number, z: number): void {
        const runtimeId = this.loadedBlockRuntimeIdAt(x, y, z);
        if (runtimeId === undefined) return;

        this.changes.worldChanged({ kind: 'block-set', position: new Vector3(x, y, z), blockRuntimeId: runtimeId });
    }

    /**
     * Destroys the block at a position: takes it out of the world, tells every player, and
     * plays the break where it stood.
     *
     * Deliberately idempotent - a position already holding air is left alone and reported as
     * `false`. *Which* packet announces a break depends on the breaking mode and the game mode.
     * With server-authoritative block breaking, the default, survival reports a
     * `PREDICT_DESTROY_BLOCK` in the tick's `PlayerAuthInputPacket`. With the client timing
     * breaks, survival sends an InventoryTransaction, on its own or inside the input. Creative
     * sends a PlayerAction in either mode, and a client is free to send more than one. Rather
     * than guess which one to trust, every route calls this, and whichever arrives second finds
     * the work already done. That is what keeps the break from sounding twice.
     * @param {Vector3} position - the block to destroy.
     * @param {Player} [player] - who broke it, when a player did. Decides what it drops.
     * @returns {boolean} `true` if a block was there and is now gone.
     */
    public async breakBlock(position: Vector3, player?: Player): Promise<boolean> {
        const x = position.getX();
        const y = position.getY();
        const z = position.getZ();

        const chunk = await this.getChunkAt(x, z);
        const state = chunk.getBlock(x, y, z);
        if (state.name === 'minecraft:air') return false;

        // The id of the exact state that was there, taken before it is replaced: it is what
        // the client resolves both the sound's material and the particles' texture from.
        const brokenRuntimeId = BlockRuntimeIds.get(state);

        // Read before the block goes, and through `getBlock` so that a state nobody
        // registered a behavior for costs the drops rather than the whole break.
        const broken = await this.getBlock(x, y, z);

        // The content path's share of the break, before the block goes: the block's behavior
        // family gets `onBreak`, which is what spills a chest, and Java's loot table for the
        // block decides what falls. Undefined for a block no content covers, and the drop
        // this server has always made is the one below.
        const contentDrops = breakBlockWithContent({
            world: this,
            position: { x, y, z },
            player,
            ...(player === undefined ? {} : { sourceId: Number(player.getRuntimeId()) })
        });

        // TODO: run a function from block.getBreakConsequences() because the broken block may
        // place more blocks or run block related code, for example ice should replace itself
        // with a water source block in survival.
        //
        // Through `setBlockByName` rather than straight into the chunk, so that everything the
        // block was holding up - a flower on it, sand above it, water beside it - is given its
        // chance to react. That is the whole of what makes breaking a block have consequences.
        await this.setBlockByName(x, y, z, 'minecraft:air');

        // One event at the block's center for the particles and the sound together, which the
        // client resolves from the runtime id. This is what a Bedrock Dedicated Server 1.26.52
        // sends for a break. It used to be a `LevelSoundEvent` plus the silent variant of this
        // event, which the client renders the same way and a packet comparison with BDS does not.
        await this.sendWorldEvent(
            new Vector3(x + 0.5, y + 0.5, z + 0.5),
            LevelEvent.PARTICLES_DESTROY_BLOCK,
            brokenRuntimeId
        );

        // Creative takes a block away and leaves nothing behind. Everywhere else the block
        // decides what it yields for the tool that broke it - which for a block needing a
        // tool the player did not have is nothing at all, and that is a drop of none rather
        // than a mistake.
        if (player?.gamemode !== Gametype.CREATIVE) {
            // TODO: no item declares a tool type yet - `Item.getToolType` is hardcoded to
            // `None` - so a block that needs one drops nothing however good the pickaxe is.
            // The item is passed all the same, so that fixing the item side fixes this too.
            const itemInHand = player?.getInventory().getItemInHand() ?? null;

            // What the break cost the tool. After the block is gone and before what it drops,
            // which is Java's order. `itemInHand` is read first, so a tool that breaks here
            // still decides what falls.
            if (player !== undefined && itemInHand !== null) {
                wearBreakingTool({
                    world: this,
                    source: { identifier: 'minecraft:player', runtimeId: Number(player.getRuntimeId()) },
                    tool: itemInHand,
                    block: { identifier: state.name, states: state.properties, position: { x, y, z } }
                });
            }

            await this.dropFromBlock({ x, y, z }, contentDrops ?? broken.getDrops(itemInHand, this.server));
        }

        return true;
    }

    /**
     * The one way a block changes.
     *
     * Everything a block change has to do, in one place: write it, tell every client, and give the
     * blocks around it a chance to react. Routing every change through here is what makes physics
     * work at all - a caller that writes into the chunk directly changes the world without anything
     * noticing, so the sand above stays in mid air and the water beside it never moves.
     * @param {number} x - World x.
     * @param {number} y - World y.
     * @param {number} z - World z.
     * @param {number} runtimeId - The block state to put there.
     * @param {number} [now] - The tick to schedule the resulting updates from.
     * @param {number} [delay=1] - Ticks before the neighbors are looked at.
     * @returns {Promise<boolean>} `false` if nothing changed - the position is outside the world,
     * its chunk is not loaded, or that block is already there.
     */
    public async setBlockRuntimeId(
        x: number,
        y: number,
        z: number,
        runtimeId: number,
        now: number = this.getTicks(),
        delay = 1
    ): Promise<boolean> {
        const chunk = this.getLoadedChunk(x >> 4, z >> 4) ?? (await this.getChunkAt(x, z));

        return this.writeBlockRuntimeId(chunk, x, y, z, runtimeId, now, delay, true);
    }

    /**
     * The same write, for a chunk that is already in memory.
     *
     * {@link World.setBlockRuntimeId} is this method with a chunk load in front of it. The
     * split exists because the content behaviors write blocks from inside the tick and cannot
     * await: a door has to see its own other half the moment it writes it, and generating
     * terrain because a behavior looked at a position would be worse than declining to write.
     * @param {number} x - World x.
     * @param {number} y - World y.
     * @param {number} z - World z.
     * @param {number} runtimeId - The block state to put there.
     * @param {number} [now] - The tick to schedule the resulting updates from.
     * @param {number} [delay=1] - Ticks before the neighbors are looked at.
     * @param {boolean} [notifyNeighbors=true] - Whether to run the engine updates the change
     * causes. Java's flag 1 in `setBlockAndUpdate`, against the bare write a diode uses for
     * its own state.
     * @returns {boolean} `false` if nothing changed, including when the chunk is not in memory.
     */
    public setLoadedBlockRuntimeId(
        x: number,
        y: number,
        z: number,
        runtimeId: number,
        now: number = this.getTicks(),
        delay = 1,
        notifyNeighbors = true
    ): boolean {
        const chunk = this.getLoadedChunk(x >> 4, z >> 4);
        if (!chunk) return false;

        return this.writeBlockRuntimeId(chunk, x, y, z, runtimeId, now, delay, notifyNeighbors);
    }

    /**
     * The same write, naming the block by its state rather than by its runtime id.
     *
     * What the engine systems write through - see {@link import('./EngineWorld')}. They
     * carry a Bedrock identifier and a state record and know nothing of runtime ids, and a
     * state this server's palette does not hold is declined rather than guessed at.
     * @param {boolean} notifyNeighbors - Whether to run the engine updates the change causes.
     * @returns {boolean} `false` if nothing changed.
     */
    public setLoadedBlockState(x: number, y: number, z: number, block: SystemBlock, notifyNeighbors: boolean): boolean {
        const runtimeId = BlockRuntimeIds.tryGetByState(block.name, block.states);
        if (runtimeId === null) return false;

        return this.setLoadedBlockRuntimeId(x, y, z, runtimeId, this.getTicks(), 1, notifyNeighbors);
    }

    /** The write itself, once a chunk to write into is in hand. */
    private writeBlockRuntimeId(
        chunk: Chunk,
        x: number,
        y: number,
        z: number,
        runtimeId: number,
        now: number,
        delay: number,
        notifyNeighbors: boolean
    ): boolean {
        if (y < chunk.getMinY() || y > chunk.getMaxY()) return false;

        // Idempotent, which matters more than it looks: physics re-examines positions constantly,
        // and a write that changed nothing would still cost a packet to every player and another
        // round of neighbor updates - so a settled pool of water would never stop working.
        const previousRuntimeId = chunk.getBlockRuntimeId(x & 0xf, y, z & 0xf);
        if (previousRuntimeId === runtimeId) return false;

        // Read before the write: the light engine's decrease wave needs what stood here.
        const previous = chunk.getBlock(x, y, z);
        chunk.setBlockRuntimeId(x & 0xf, y, z & 0xf, runtimeId);
        this.blockWriteVersion = World.nextBlockWriteVersion++;
        this.server.invalidateEntityBlockCaches?.(this.dimension.name, x >> 4, z >> 4);
        const state = chunk.getBlock(x, y, z);
        this.getPortalIndex().blockChanged({ x, y, z }, previous.name, state.name);
        const next: SystemBlock = { name: state.name, states: state.properties };
        this.systems.onBlockChanged(
            { x, y, z },
            { name: previous.name, states: previous.properties, runtimeId: previousRuntimeId },
            { ...next, runtimeId }
        );

        this.changes.worldChanged({ kind: 'block-set', position: new Vector3(x, y, z), blockRuntimeId: runtimeId });

        this.blockUpdates.scheduleAround(x, y, z, now, delay);

        // Last, so that everything the change has to report has been reported before a
        // circuit, a fluid or a fire reacts to it and writes the next block. The content
        // families come after the engine systems for the same reason, and they come at all
        // because `createContentBlockGroup().set` used to be the only write that told them:
        // see {@link import('./neighborContent')}.
        if (notifyNeighbors) {
            if (this.server.getContent() === undefined) this.systems.updateAround({ x, y, z }, next);
            notifyContentNeighbors(this, { x, y, z });
        }
        return true;
    }

    /**
     * The same, for a block in its default state.
     * @param {number} x - World x.
     * @param {number} y - World y.
     * @param {number} z - World z.
     * @param {string} name - The block's namespace id.
     * @param {number} [now] - The tick to schedule the resulting updates from.
     * @param {number} [delay=1] - Ticks before the neighbors are looked at.
     * @returns {Promise<boolean>} `false` if nothing changed, or this server has no such block.
     */
    public async setBlockByName(
        x: number,
        y: number,
        z: number,
        name: string,
        now: number = this.getTicks(),
        delay = 1
    ): Promise<boolean> {
        const runtimeId = BlockRuntimeIds.tryGetByName(name);
        if (runtimeId === null) return false;

        return this.setBlockRuntimeId(x, y, z, runtimeId, now, delay);
    }

    /** The queue of positions waiting to react to a change - see {@link BlockUpdateScheduler}. */
    public getBlockUpdates(): BlockUpdateScheduler {
        return this.blockUpdates;
    }

    /** The lit nether portal blocks of this world, kept in step with its block writes and chunk loads. */
    public getPortalIndex(): PortalIndex {
        return (this.portalIndex ??= new PortalIndex());
    }

    /**
     * The village raids of this dimension, which only the Overworld has.
     *
     * Built on first use from what the level saved, so a raid that was running when the server
     * stopped carries on.
     */
    public getRaidManager(): RaidManager | undefined {
        if (this.dimension.id !== Dimensions.Overworld.id) return undefined;
        // `?.` because a world built by hand has a level that saved nothing.
        if (this.raidManager === undefined) {
            const saved = this.level.storedRaids?.() ?? [];
            // A raider saved in a chunk that is not loaded yet is still a raider.
            for (const raid of saved) {
                for (const identity of raid.raiders) this.dataEntities().runtime.trackIdentity(identity);
            }
            this.raidManager = new RaidManager(this.raidHost(), saved);
        }
        return this.raidManager;
    }

    /** The raids to save, or undefined when this world never ran one. */
    public raidSaveState(): RaidRecord[] | undefined {
        return this.raidManager?.records();
    }

    /** What the raid manager asks of this world. */
    private raidHost(): RaidHost {
        const livePlayers = () =>
            this.getPlayers()
                .filter((player) => player.gamemode !== Gametype.SPECTATOR)
                .map((player) => ({
                    id: Number(player.getRuntimeId()),
                    position: {
                        x: player.getPosition().getX(),
                        y: player.getPosition().getY(),
                        z: player.getPosition().getZ()
                    },
                    get badOmenLevel() {
                        const omen = player.getStatusEffect('minecraft:bad_omen');
                        return omen === undefined ? 0 : omen.amplifier + 1;
                    },
                    clearBadOmen: () => void player.removeStatusEffect('minecraft:bad_omen'),
                    grantHero: (amplifier: number, ticks: number) =>
                        void player.addStatusEffect({
                            id: 'minecraft:village_hero',
                            amplifier,
                            durationTicks: ticks
                        })
                }));
        return {
            difficulty: () => this.server.getConfig().getDifficulty(),
            random: () => this.server.getRandom()(),
            players: livePlayers,
            villageCenterAt: (at) => this.dataEntities().runtime.villageCenterNear(at),
            isVillage: (at) => this.dataEntities().runtime.villageCenterNear(at) !== undefined,
            surfaceAt: (x, z) => {
                const chunk = this.getLoadedChunk(x >> 4, z >> 4);
                return chunk === null ? undefined : chunk.getTopStoredY() + 1;
            },
            spawnRaider: (type, at) => {
                const identity = this.dataEntities().runtime.spawn(type, at)?.persistentIdentity;
                if (identity !== undefined) this.dataEntities().runtime.trackIdentity(identity);
                return identity;
            },
            raiderAlive: (identity) => this.dataEntities().runtime.isAliveByIdentity(identity)
        };
    }

    /**
     * The dragon fight of this world, created on first ask over the state the save held.
     *
     * @returns The fight, or undefined in a dimension whose type has no
     * `has_ender_dragon_fight` flag, which is every vanilla dimension but the End.
     */
    public getDragonFight(): DragonFight | undefined {
        if (!this.dimension.java.hasEnderDragonFight) return undefined;

        return (this.dragonFight ??= new DragonFight(this, this.level.storedDragonFightState(), this.level.seed));
    }

    /**
     * The fight's persistable state, without creating a fight that never ran.
     *
     * The level's save reads this; a world whose fight was never asked for answers undefined,
     * and the level keeps whatever the save already held.
     */
    public dragonFightSaveState(): DragonFightState | undefined {
        return this.dragonFight?.state();
    }

    /** The light engine and the two scheduled tick lists - see {@link WorldSystems}. */
    public getSystems(): WorldSystems {
        return this.systems;
    }

    /** What the sky is doing: `clear`, `rain` or `thunder`. One answer per level. */
    public getWeather(): Weather {
        return this.level.getWeather().current();
    }

    /**
     * Whether rain is falling on one position, Java's `Level.isRainingAt`.
     *
     * Three of Java's four conditions: it has to be raining, the position has to see the sky,
     * and nothing may stand above it. The fourth is the biome's precipitation, which is a
     * temperature curve over the height that neither edition publishes in a form this
     * repository holds, so every biome counts as rainy here and fire in a snowy one is put out
     * where Java would leave it burning.
     *
     * The sky test is the light engine's. Full sky light means an unobstructed column: sky
     * light loses at least one per step the moment it has to travel sideways, so 15 at a
     * position and nowhere short of the sky above it are the same statement. The engine
     * already keeps it per block and updates it with every write, which is the whole reason
     * not to walk the column here - {@link World.topOfColumn} answers per chunk at sub chunk
     * resolution, so one block on a hilltop would shelter the whole chunk from the rain.
     *
     * It is also Java's own test rather than an approximation of it. `Level.canSeeSky` reads
     * the `MOTION_BLOCKING` heightmap, which a fire does not raise because it has no
     * collision; a fire does not dampen light here either, so the position it stands in still
     * reads 15.
     *
     * @returns False in an unloaded chunk or a dimension without a sky. A loaded chunk outside
     * the simulation light ring is initialized and settled on demand before this test reads it.
     */
    public isRainingAt(x: number, y: number, z: number): boolean {
        if (!this.dimension.java.hasSkylight || !this.level.getWeather().raining()) return false;

        const skyLight = this.systems.getSkyLight?.(x, y, z) ?? this.systems.lighting.getSkyLight(x, y, z);
        return skyLight === FULL_SKY_LIGHT;
    }

    /**
     * Sets the weather, which is what `/weather <kind> [duration]` does.
     *
     * @param kind - `clear`, `rain` or `thunder`.
     * @param durationTicks - How long, in ticks. Left out, each kind gets Java's own
     *   randomized default: 10 to 150 minutes clear, 10 to 20 raining, 3 to 13 storming.
     */
    public setWeather(kind: Weather, durationTicks?: number): void {
        this.level.getWeather().set(kind, durationTicks);
    }

    /**
     * Where this tick's random draws land: Java's `ServerLevel.tickChunks`, in two halves.
     *
     * Only a chunk a player ticket holds is simulated, so an empty server draws nothing at all
     * however much of the world is in memory - which is also why nobody's furnaces burn while
     * they are logged off. And within a chunk, only the sections whose palette holds something
     * that takes random ticks, which is Java's `LevelChunkSection.isRandomlyTicking`; see
     * {@link Chunk.getRandomTickSections}. The three hundred blocks of air over an Overworld column
     * and the stone under it are both skipped.
     *
     * The section test has to be Java's rather than merely cheap, because the draw state is one
     * counter shared across the world: a section drawn for that Java skips steps the counter and
     * moves every position drawn afterwards.
     * Public for the same reason {@link World.loadedBlockAt} is: {@link WorldSystems} is handed
     * the world's reads rather than the world itself.
     * @returns {RandomTickChunk[]} One entry per simulated chunk, with its randomly ticking
     * sections.
     */
    public randomTickChunks(): RandomTickChunk[] {
        const playerChunkRefCounts = this.getPlayerChunkRefCounts();
        playerChunkRefCounts.synchronize(this.players);
        if (this.players.size === 0) return [];

        const visited: RandomTickChunk[] = [];
        for (const chunk of this.simulationChunks(playerChunkRefCounts)) {
            const x = chunk.getX();
            const z = chunk.getZ();
            const sections = chunk.getRandomTickSections();
            if (sections.length > 0) visited.push({ x, z, sections });
        }

        return visited;
    }

    private getPlayerChunkRefCounts(): PlayerChunkRefCounts {
        if (this.playerChunkRefCounts === undefined) {
            this.playerChunkRefCounts = new PlayerChunkRefCounts();
            for (const chunk of this.chunks.values()) this.playerChunkRefCounts.chunkLoaded(chunk);
        }
        return this.playerChunkRefCounts;
    }

    /** Loaded chunks eligible for tick work, preserving the loaded-map order on cache rebuild. */
    private simulationChunks(playerChunkRefCounts: PlayerChunkRefCounts): readonly Chunk[] {
        const coverageRevision = playerChunkRefCounts.getRevision();
        const loadedRevision = this.loadedChunksRevision;
        const cached = this.simulationChunksCache;
        if (
            cached !== undefined &&
            cached.coverageRevision === coverageRevision &&
            cached.loadedRevision === loadedRevision
        )
            return cached.chunks;

        const chunks: Chunk[] = [];
        for (const chunk of this.chunks.values()) {
            if (playerChunkRefCounts.simulates(chunk.getX(), chunk.getZ())) chunks.push(chunk);
        }
        this.simulationChunksCache = { coverageRevision, loadedRevision, chunks };
        return chunks;
    }

    private chunkNeedsLight(chunkX: number, chunkZ: number): boolean {
        const playerChunkRefCounts = this.getPlayerChunkRefCounts();
        playerChunkRefCounts.synchronize(this.players);
        return playerChunkRefCounts.lights(chunkX, chunkZ);
    }

    /**
     * Loaded chunks in the simulation area and its one-chunk light guard ring.
     *
     * The same array comes back until a chunk loads, unloads or a player's coverage changes, so a
     * caller can tell that nothing moved by comparing identity.
     */
    private lightChunks(): readonly { readonly x: number; readonly z: number }[] {
        const playerChunkRefCounts = this.getPlayerChunkRefCounts();
        playerChunkRefCounts.synchronize(this.players);

        const coverageRevision = playerChunkRefCounts.getRevision();
        const loadedRevision = this.loadedChunksRevision;
        const cached = this.lightChunksCache;
        if (cached?.coverageRevision === coverageRevision && cached.loadedRevision === loadedRevision)
            return cached.chunks;

        const chunks: { readonly x: number; readonly z: number }[] = [];
        for (const chunk of this.chunks.values()) {
            if (playerChunkRefCounts.lights(chunk.getX(), chunk.getZ()))
                chunks.push({ x: chunk.getX(), z: chunk.getZ() });
        }
        this.lightChunksCache = { coverageRevision, loadedRevision, chunks };
        return chunks;
    }

    /** The block layer palette for one section; its revision invalidates cached light facts. */
    private lightSectionPalette(chunkX: number, sectionY: number, chunkZ: number) {
        const chunk = this.chunks.get(Chunk.packXZ(chunkX, chunkZ));
        if (chunk === undefined) return undefined;

        const subChunk = chunk.getSubChunk(sectionY);
        // The light view reads layer 0, so layer 1's waterlogged palette must not affect its hint.
        const blockStorage = subChunk?.getStorages()[0];
        return {
            revision: subChunk?.getRevision() ?? -1,
            runtimeIds: blockStorage?.getPalette() ?? []
        };
    }

    /**
     * The block at a position, or undefined when its chunk is not in memory.
     *
     * The synchronous read the light engine and the random tick pass need: both run inside the
     * tick and neither may generate terrain by looking at it.
     */
    public loadedBlockAt(x: number, y: number, z: number): SystemBlock | undefined {
        const chunk = this.getLoadedChunk(x >> 4, z >> 4);
        if (!chunk || y < chunk.getMinY() || y > chunk.getMaxY()) return undefined;

        const state = chunk.getBlock(x, y, z);
        return { name: state.name, states: state.properties };
    }

    /**
     * The runtime id at a position, or undefined where {@link loadedBlockAt} has no block.
     *
     * The same read without resolving the id to a state, for a caller that keeps a table of its
     * own per runtime id. The light engine does: it wants two numbers per block and asks tens of
     * millions of times while a world preloads, and resolving each of those to a `BlockState` and
     * then through the property table by name and state values was most of the cost of lighting
     * a chunk.
     * @param {number} x - World x.
     * @param {number} y - World y.
     * @param {number} z - World z.
     * @returns {number | undefined} The runtime id, air's where the column has no sub chunk, and
     * undefined when the chunk is not in memory or `y` is outside the dimension.
     */
    public loadedBlockRuntimeIdAt(x: number, y: number, z: number): number | undefined {
        const chunk = this.getLoadedChunk(x >> 4, z >> 4);
        if (!chunk || y < chunk.getMinY() || y > chunk.getMaxY()) return undefined;

        return chunk.getBlockRuntimeId(x, y, z);
    }

    /**
     * One past the highest y a column stores a block for - see {@link Chunk.getTopStoredY}.
     *
     * Public for the same reason {@link loadedBlockAt} is. A chunk that is not in memory answers
     * with the dimension ceiling, because the only safe answer about a column nothing can read is
     * that something might stand anywhere in it.
     * @param {number} x - World x.
     * @param {number} z - World z.
     * @returns {number} One past the highest stored y.
     */
    public topOfColumn(x: number, z: number): number {
        return this.getLoadedChunk(x >> 4, z >> 4)?.getTopStoredY() ?? maxY(this.dimension) + 1;
    }

    /**
     * Lets every block that came due react.
     *
     * Sequential rather than concurrent on purpose. These updates write blocks, and two of them
     * running at once can both read the same position before either writes it - so a column of
     * falling sand duplicates itself, and water spreads twice into the same hole.
     *
     * The scheduler's count is the only budget, and nothing here reads the clock: a slow host
     * runs the same updates as a fast one and ticks slower, so a replay agrees with live play.
     */
    private async runBlockUpdates(): Promise<void> {
        for (const { x, y, z } of this.blockUpdates.due(this.getTicks())) {
            const update = this.physics.update(x, y, z, this.getTicks());
            // Settled positions finish synchronously; state-changing updates still await here
            // before the next position so block writes keep their Java tick order.
            if (update !== undefined) await update;
        }
    }

    /**
     * The most dropped stacks one world keeps on the ground at once.
     *
     * Neither edition publishes a number like this, and neither needs one. Java bounds its
     * item entities with a 6000-tick despawn, and both editions merge stacks that land
     * together, which this server does too in `entity/other/Item.ts`. What neither bounds is
     * a burst. {@link BlockUpdateScheduler} lets one tick process 4096 positions, every one
     * of which can destroy a block and roll its loot table, and a world that has just
     * generated hundreds of chunks has that much work waiting in it. The reported crash was
     * over 10,000 stacks on the ground, each one falling, comparing itself against its
     * neighbors to merge, and going out to every player in range, every tick.
     *
     * The number is this server's own judgement rather than anything Mojang publishes: well
     * past what play produces, well short of what the per-tick merge pass can carry.
     */
    public static readonly ITEM_ENTITY_LIMIT = 2048;

    /** Ticks between two reports that {@link World.ITEM_ENTITY_LIMIT} turned a drop away. */
    private static readonly ITEM_ENTITY_LIMIT_REPORT_INTERVAL = 20;

    /** The running answer {@link World.itemEntityCount} gives, absent until something asks. */
    private itemEntities: number | undefined;

    /** The tick the limit was last reported on, so one cascade is one line a second. */
    private itemEntityLimitReportedAt: number | undefined;

    /**
     * How many of {@link World.entities} are dropped stacks.
     *
     * Counted from the map once and kept in step by {@link World.addEntity} and
     * {@link World.removeEntity} after that. A cascade of block updates reaches the drop path
     * thousands of times in a tick, and walking the map that often is the cost this limit
     * exists to avoid.
     * @returns {number} The number of `minecraft:item` entities in the world.
     */
    private itemEntityCount(): number {
        this.itemEntities ??= [...this.entities.values()].filter((entity) => entity instanceof ItemEntity).length;
        return this.itemEntities;
    }

    /**
     * Puts items on the ground at a position, one entity each.
     *
     * Past {@link World.ITEM_ENTITY_LIMIT} stacks in the world the remaining drops are lost
     * rather than spawned. Losing a drop is worse than vanilla and better than the server
     * going down, and it is reported so an operator can tell which happened.
     * @param {Vector3} position - where they land, still.
     * @param {Array} contents - what to drop; nulls are skipped, so a block that drops
     * nothing for the tool used can say so plainly.
     */
    public async dropContents(position: Vector3, contents: Array<Block | Item | null>): Promise<void> {
        await this.spill(position, contents, () => ({ position }));
    }

    /**
     * Puts what a block yielded on the ground, each stack popping out of the block.
     *
     * Where a Bedrock Dedicated Server 1.26.52 puts a block's drop: at a random spot inside the
     * block, pushed a little sideways and upward; see {@link popOut}. The push is what brings
     * stacks from neighboring blocks within the half block they merge at, and merging is what
     * keeps a burst of breaks under {@link World.ITEM_ENTITY_LIMIT}.
     * @param {ContentPosition} block - the block they came out of.
     * @param {Array} contents - what to drop, as for {@link World.dropContents}.
     */
    public async dropFromBlock(block: ContentPosition, contents: Array<Block | Item | null>): Promise<void> {
        const random = randomOf(this.server);
        const center = new Vector3(block.x + 0.5, block.y + 0.5, block.z + 0.5);

        await this.spill(center, contents, () => popOut(block, random));
    }

    /**
     * Drops player-held stacks from the player's eyes, with Java's forward toss and pickup delay.
     *
     * Java places the item at eye height minus 0.3 blocks and gives it a 0.3-block-per-tick
     * velocity along the view, with its small vanilla spread. The spawn position passed to
     * {@link World.spill} is the item's feet; the item actor reports 0.125 blocks above it.
     * @param player - The player who dropped the stacks.
     * @param contents - The stacks to drop; nulls and empty stacks are skipped.
     */
    public async dropFromPlayer(player: Player, contents: Array<Block | Item | null>): Promise<void> {
        const eyes = player.getPosition();
        const random = randomOf(this.server);
        const pitch = (player.pitch * Math.PI) / 180;
        const yaw = (player.yaw * Math.PI) / 180;
        const horizontal = Math.cos(pitch) * 0.3;
        const feet = new Vector3(eyes.getX(), eyes.getY() - 0.3 - ITEM_POSITION_OFFSET, eyes.getZ());

        await this.spill(eyes, contents, () => {
            const angle = random() * Math.PI * 2;
            const spread = random() * 0.02;
            const motion = new Vector3(
                -Math.sin(yaw) * horizontal + Math.cos(angle) * spread,
                -Math.sin(pitch) * 0.3 + 0.1 + (random() - random()) * 0.1,
                Math.cos(yaw) * horizontal + Math.sin(angle) * spread
            );

            return { position: feet, motion, pickupDelay: 40 };
        });
    }

    /**
     * What {@link World.dropContents}, {@link World.dropFromBlock}, and {@link World.dropFromPlayer}
     * share, up to where each stack starts.
     * @param {Vector3} position - where the drop happened, for the log.
     * @param {Array} contents - what to drop.
     * @param {Function} start - where one stack starts and how fast, asked once per stack.
     */
    private async spill(
        position: Vector3,
        contents: Array<Block | Item | null>,
        start: () => DropStart
    ): Promise<void> {
        // A break running its block's `onBreak` takes what the family drops, so a container's
        // contents can be told from the family's stand-in for the loot table rather than
        // landing beside the roll; see {@link import('./blockBreak')}.
        if (
            collectBreakDrops(
                this,
                {
                    x: Math.floor(position.getX()),
                    y: Math.floor(position.getY()),
                    z: Math.floor(position.getZ())
                },
                contents
            )
        ) {
            return;
        }

        // A block that promises a drop the server cannot make yields `null` here - most often
        // because it names an item nothing has registered. Silently filtered, that is a break
        // that leaves nothing behind and no way to tell why, which is indistinguishable from
        // a drop that was never sent.
        const missing = contents.length - contents.filter((drop) => drop !== null).length;
        if (missing > 0) {
            this.server
                .getLogger()
                .debug(
                    `${missing} drop(s) at ${position.toString()} named nothing this server has`,
                    'World/dropContents'
                );
        }

        const wanted = contents.filter((drop): drop is Block | Item => drop !== null && !isEmptyItemDrop(drop));
        const room = Math.max(0, World.ITEM_ENTITY_LIMIT - this.itemEntityCount());
        if (wanted.length > room) this.reportItemEntityLimit(wanted.length - room);

        // Asked after the limit and the break's own collection, so a stack that never reaches the
        // ground costs no roll.
        await Promise.all(
            wanted.slice(0, room).map(async (drop) => {
                const { position: at, motion, pickupDelay } = start();
                await this.dropItem(at, drop, motion, pickupDelay);
            })
        );
    }

    /**
     * Says that the world is full of dropped stacks, at most once a second.
     *
     * The condition is a flood by definition, so a line per lost drop would be the same
     * thousands-of-things problem one level up.
     * @param {number} lost - Drops turned away by this call, not by the flood as a whole.
     */
    private reportItemEntityLimit(lost: number): void {
        const last = this.itemEntityLimitReportedAt;
        if (last !== undefined && this.getTicks() - last < World.ITEM_ENTITY_LIMIT_REPORT_INTERVAL) return;
        this.itemEntityLimitReportedAt = this.getTicks();

        this.server
            .getLogger()
            .warn(
                `${this.name} is at its limit of ${World.ITEM_ENTITY_LIMIT} dropped stacks; this break lost ${lost}`,
                'World/dropContents'
            );
    }

    /**
     * Puts one stack on the ground as a `minecraft:item` entity.
     *
     * A block is turned into the item it becomes once picked up: only an item can go on the
     * wire, and `Block` has no serialisation of its own - which is exactly the cast
     * `ContainerEntry` warns about, made honestly here instead.
     */
    private async dropItem(
        position: Vector3,
        drop: Block | Item,
        motion?: Vector3,
        pickupDelay?: number
    ): Promise<void> {
        const item =
            drop instanceof Item ? drop : new Item({ name: drop.getName(), content: this.server.getContent() });

        // A stack with no runtime id goes out as air, and the client draws an item actor holding
        // air as an empty item on the ground. That is an unknown Java id `bedrockDrops` kept, or
        // a block whose drop names no item. Logged, so the block that made it can be found.
        if (item.getName() === 'minecraft:air' || item.getRuntimeId() === 0) {
            this.server
                .getLogger()
                .debug(
                    `Dropped nothing for ${item.getName()} at ${position.toString()}: it has no item id`,
                    'World/dropItem'
                );
            return;
        }

        // Without the stack network id it had in a player's inventory. Ids are counted per
        // player, so whoever picks the stack up gives it one of their own; carried along, it
        // could name another of their stacks as well.
        let grounded = item;
        if (item.stackNetworkId !== 0) {
            grounded = item.withCount(item.getAmount());
            grounded.stackNetworkId = 0;
        }

        // Built where it lands, so nothing has to be moved into place afterwards and no
        // client is told about a position the entity never actually held. The entity's own
        // position is the one a client is told, which is above where the stack lies.
        const entity = new ItemEntity({
            item: new ContainerEntry({ item: grounded, count: grounded.getAmount() }),
            position: new Position(position.getX(), position.getY() + ITEM_POSITION_OFFSET, position.getZ(), this),
            motion,
            pickupDelay
        });

        await this.addEntity(entity);

        // Said once per drop, because everything between here and a floating item on screen -
        // the entity, the visibility pass, the actor packet - is invisible from the outside,
        // and "I see no drop" otherwise cannot be told from "no drop was made".
        this.server
            .getLogger()
            .debug(
                `Dropped ${item.getName()} (runtime id ${item.getRuntimeId()}) at ${position.toString()}`,
                'World/dropItem'
            );
    }

    /** How often the time of day is put on the wire, in ticks. Vanilla sends it every second. */
    private static readonly TIME_SYNC_INTERVAL_TICKS = 20;

    /**
     * Sends the current time to all players in the world.
     *
     * Once a second rather than on every tick. The client runs its own day cycle between
     * updates, so twenty of these a second told it nothing it had not already worked out -
     * `SetTimePacket` is in the default `log-excluded-packets` purely because of the noise
     * this made.
     */
    public async sendTime(): Promise<void> {
        if (this.getTicks() % World.TIME_SYNC_INTERVAL_TICKS !== 0) return;

        await this.changes.timeChanged(this.getTicks());
    }

    /**
     * Adds an entity body to the level.
     * Generic bodies a data runtime can build are handed to it first; its replacement body
     * re-enters here after the runtime has indexed it, so the replacement is added normally.
     * @param {Entity} entity - The entity to add.
     */
    public async addEntity(entity: Entity): Promise<void> {
        const live = this.server.getEntityRuntime?.(this.dimension.name);
        if (
            entity instanceof GenericEntity &&
            live !== undefined &&
            live.bodies.entityIdOf(entity) === undefined &&
            this.restoreDataEntity(entity, live)
        )
            return;

        // Kept in step only once something has asked for it; before that the first count
        // reads the map, which already holds this arrival. Re-adding one the world already
        // has is a replacement rather than an arrival.
        const runtimeId = Number(entity.getRuntimeId());

        if (this.itemEntities !== undefined && entity instanceof ItemEntity && !this.entities.has(runtimeId))
            this.itemEntities += 1;

        this.entities.set(runtimeId, entity);
        if (entity instanceof Player) this.players.set(runtimeId, entity);
        this.getEntityIndex().addLegacy(entity);
        this.markEntityChunkChanged(entity);

        // Reported once the maps hold it, so that whoever works out who should see what is
        // looking at the world as it now is - the arrival included.
        await this.changes.entityAdded(entity);
    }

    /**
     * Removes an entity from the level.
     * @param {Entity} entity - The entity to remove.
     */
    public async removeEntity(entity: Entity): Promise<void> {
        this.server.getEntityRuntime?.(this.dimension.name)?.removeBody?.(entity);

        const runtimeId = entity.getRuntimeId();
        const runtimeIdKey = Number(runtimeId);
        const chunkIndex = this.entityChunkIndices.get(runtimeIdKey);
        if (chunkIndex !== undefined) {
            this.chunks.get(chunkIndex)?.markEntitiesChanged();
            const runtimeIds = this.runtimeIdsByChunk().get(chunkIndex);
            runtimeIds?.delete(runtimeIdKey);
            if (runtimeIds?.size === 0) this.runtimeIdsByChunk().delete(chunkIndex);
        }
        this.entityChunkIndices.delete(runtimeIdKey);

        if (this.itemEntities !== undefined && entity instanceof ItemEntity && this.entities.has(runtimeIdKey))
            this.itemEntities -= 1;

        this.getEntityIndex().removeLegacy(entity);
        this.entities.delete(runtimeIdKey);
        this.players.delete(runtimeIdKey);

        // Taken out of the maps first, so a leaving player is not among the clients told
        // about its own departure - and so nothing is announced to a session on its way out.
        await this.changes.entityRemoved(entity);
    }

    /**
     * Removes chunks outside every player's simulation and view areas after saving them.
     *
     * Chunks loaded before the first player remain available for spawn preparation. Once a
     * player is online, chunks beyond the largest area that player needs can be read back from
     * the provider instead of accumulating for the life of the server.
     */
    private chunksOutsidePlayerRetention(): Chunk[] {
        if (this.getProvider().supportsChunkUnload !== true) return [];
        const playerChunkRefCounts = this.getPlayerChunkRefCounts();
        playerChunkRefCounts.synchronize(this.players);
        if (this.players.size === 0) return [];

        const candidates: Chunk[] = [];
        for (const index of playerChunkRefCounts.getUnloadCandidates()) {
            if (candidates.length >= CHUNK_UNLOAD_BATCH_SIZE) break;

            const chunk = this.chunks.get(index);
            if (chunk === undefined) continue;
            if (this.loading.has(index) || this.chunkNeededByPlayers(chunk)) continue;
            candidates.push(chunk);
        }

        return candidates;
    }

    /** Starts one tick-selected batch without holding the tick on a queued chunk write. */
    private beginDistantChunkUnloads(): void {
        if (this.closing || this.unloading !== null) return;

        const candidates = this.chunksOutsidePlayerRetention();
        if (candidates.length === 0) return;

        let tracked: Promise<void>;
        tracked = this.unloadChunks(candidates)
            .catch((error: unknown) => {
                this.server.getLogger().error(`Failed to unload distant chunks for ${this.getFormattedName()}`);
                this.server.getLogger().error(error);
            })
            .finally(() => {
                if (this.unloading === tracked) this.unloading = null;
            });
        this.unloading = tracked;
    }

    private async unloadDistantChunks(): Promise<void> {
        await this.unloadChunks(this.chunksOutsidePlayerRetention());
    }

    private async unloadChunks(candidates: readonly Chunk[]): Promise<void> {
        if (candidates.length === 0) return;

        this.dataEntities().persist();
        const saveContext = this.chunkSaveContext();
        // Saved one after another, and each saved chunk then waits for the input step to take it
        // out, so a batch leaves at the next step rather than one chunk a tick.
        const leaving: Promise<boolean>[] = [];
        for (const chunk of candidates) leaving.push((await this.unloadChunk(chunk, saveContext)).left);
        await Promise.all(leaving);
    }

    /**
     * Saves one chunk, then has the admission queue take it and the non-player entities it holds
     * out of the world (ADR 0009): a chunk leaves at an input step, like one that enters.
     *
     * @returns Settles once the save is done, with the removal, which settles once applied.
     */
    private async unloadChunk(
        chunk: Chunk,
        saveContext: ChunkSaveContext
    ): Promise<{ readonly left: Promise<boolean> }> {
        const index = Chunk.packXZ(chunk.getX(), chunk.getZ());
        if (this.chunks.get(index) !== chunk || this.loading.has(index)) return { left: Promise.resolve(false) };

        try {
            await this.enqueueSave(async () => {
                this.getPlayerChunkRefCounts().synchronize(this.players);
                if (this.chunks.get(index) !== chunk || this.loading.has(index) || this.chunkNeededByPlayers(chunk))
                    return;

                const entities = saveContext.entitiesByChunk.get(index) ?? [];
                if (chunk.getHasChanged() || entities.length > 0) {
                    await this.getProvider().writeChunk(chunk, saveContext);
                }
            });
        } catch (error: unknown) {
            this.getPlayerChunkRefCounts().synchronize(this.players);
            this.server.getLogger().error(`Failed to save chunk ${chunk.getX()},${chunk.getZ()} before unloading`);
            this.server.getLogger().error(error);
            return { left: Promise.resolve(false) };
        }

        const leave = () => this.leaveChunk(chunk);
        const admissions = this.admissions;
        if (admissions === undefined) return { left: leave() };
        return {
            left: admissions.hold({
                ...this.chunkAdmission('leave', chunk.getX(), chunk.getZ()),
                priority: 'idle',
                apply: leave
            })
        };
    }

    /**
     * Takes a saved chunk and the non-player entities it holds out of the world, unless something
     * wants it again: a load, a change since the save, or a player who came back.
     *
     * @returns Whether it left.
     */
    private async leaveChunk(chunk: Chunk): Promise<boolean> {
        const index = Chunk.packXZ(chunk.getX(), chunk.getZ());
        this.getPlayerChunkRefCounts().synchronize(this.players);
        if (
            this.chunks.get(index) !== chunk ||
            this.loading.has(index) ||
            chunk.getHasChanged() ||
            this.chunkNeededByPlayers(chunk)
        )
            return false;

        const removals: Promise<void>[] = [];
        for (const entity of this.entitiesInChunk(chunk)) {
            if (this.dataEntities().unload(entity)) continue;
            removals.push(this.removeEntity(entity));
        }

        this.systems.onChunkUnloaded(chunk.getX(), chunk.getZ());
        this.chunks.delete(index);
        this.loadedChunksRevision++;
        this.getPlayerChunkRefCounts().chunkUnloaded(chunk);
        this.portalIndex?.chunkUnloaded(chunk);
        this.server.invalidateEntityBlockCaches?.(this.dimension.name, chunk.getX(), chunk.getZ());
        this.lastChunkIndex = -1;
        this.lastChunk = null;
        this.lastChunkSource = null;
        await Promise.all(
            removals.map(async (removal) => {
                try {
                    await removal;
                } catch (error: unknown) {
                    this.server
                        .getLogger()
                        .error(`Failed to remove entities from chunk ${chunk.getX()},${chunk.getZ()}`);
                    this.server.getLogger().error(error);
                }
            })
        );
        return true;
    }

    /**
     * Tells the travel service about every entity whose body overlaps a portal block this tick.
     *
     * One touch per entity, for the first portal block found walking the body's cells from the
     * feet up: a body in two portal blocks at once is in one portal. An entity on portal
     * cooldown is touched too, so the travel service can wind the cooldown back while it
     * stands in the arrival portal. A player whose client is still on the loading screen of
     * the last change is skipped: another change would be refused, so the body scan is not
     * worth running.
     */
    private async touchPortals(entities: readonly Entity[]): Promise<void> {
        const travel = this.server.getDimensionTravel();

        // Awaited so that an asynchronous `entityPortalEnter` listener has answered before
        // the entity's own update advances the contact. An entity in no portal costs no await.
        const touches: Promise<void>[] = [];
        for (const entity of entities) {
            if (isMidDimensionChange(entity)) continue;
            const portal = this.portalOverlapping(entity);
            if (portal !== undefined) touches.push(travel.touch(entity, portal));
        }
        await Promise.all(touches);
    }

    /**
     * The first portal block an entity's body overlaps, or undefined when it stands in none.
     *
     * Java's `Entity.checkInsideBlocks` walks the blocks of the bounding box shrunk by
     * `1.0E-6`, so a body resting on a block boundary does not count the block beyond it, and a
     * portal at head height alone still counts.
     */
    private portalOverlapping(entity: Entity): PortalBlockRef | undefined {
        const at = entity.getPosition();
        const { width, height } = entity.getBox();
        const half = Math.max(width / 2 - BODY_SHRINK, 0);
        const feet = entity.getFeetY();
        const minX = Math.floor(at.getX() - half);
        const maxX = Math.floor(at.getX() + half);
        const minZ = Math.floor(at.getZ() - half);
        const maxZ = Math.floor(at.getZ() + half);
        const minY = Math.floor(feet + BODY_SHRINK);
        const maxY = Math.floor(Math.max(feet + height - BODY_SHRINK, feet + BODY_SHRINK));

        for (let y = minY; y <= maxY; y += 1) {
            for (let x = minX; x <= maxX; x += 1) {
                for (let z = minZ; z <= maxZ; z += 1) {
                    if (!this.isPortalAt(x, y, z)) continue;
                    const block = this.loadedBlockAt(x, y, z);
                    if (block === undefined) continue;
                    return { world: this, position: new Vector3(x, y, z), block: block.name };
                }
            }
        }
        return undefined;
    }

    /**
     * Whether a loaded position holds a portal block.
     *
     * Every entity scans its body cells each tick and nearly all of them are air or stone, so the
     * answer is memoised per runtime id, which names one block state, instead of building a block
     * for each cell. The memo is dropped when a plugin changes the block catalog.
     */
    private isPortalAt(x: number, y: number, z: number): boolean {
        const runtimeId = this.loadedBlockRuntimeIdAt(x, y, z);
        if (runtimeId === undefined) return false;

        // Created here, for the same hand-built worlds as {@link World.runtimeIdsByChunk}.
        const memo = (this.portalRuntimeIds ??= new Map());
        const catalogRevision = BlockStateSchemas.getRevision();
        if (catalogRevision !== this.portalRuntimeIdsRevision) {
            memo.clear();
            this.portalRuntimeIdsRevision = catalogRevision;
        }

        let portal = memo.get(runtimeId);
        if (portal === undefined) {
            const block = this.loadedBlockAt(x, y, z);
            portal = block !== undefined && isPortalBlock(block.name);
            memo.set(runtimeId, portal);
        }
        return portal;
    }

    private chunkNeededByPlayers(chunk: Chunk): boolean {
        return this.getPlayerChunkRefCounts().retains(chunk.getX(), chunk.getZ());
    }

    private entitiesInChunk(chunk: Chunk): Entity[] {
        const runtimeIds = this.runtimeIdsByChunk().get(Chunk.packXZ(chunk.getX(), chunk.getZ()));
        if (runtimeIds === undefined) return [];

        const entities: Entity[] = [];
        for (const runtimeId of runtimeIds) {
            const entity = this.entities.get(runtimeId);
            if (entity !== undefined) entities.push(entity);
        }
        return entities;
    }

    /**
     * Returns the reverse actor index, creating it for lightweight World test doubles that bypass
     * the constructor. Normal worlds already own the map from field initialization.
     */
    private runtimeIdsByChunk(): Map<number, Set<number>> {
        return (this.entityRuntimeIdsByChunk ??= new Map());
    }

    /** Builds the entity and actor indexes once for every chunk in a save or unload pass. */
    private chunkSaveContext(): ChunkSaveContext {
        const entities = this.entities?.values() ?? this.getEntities();
        return createChunkSaveContext(this.dimension.bedrockId, entities, (entity) => {
            const chunkIndex = this.entityChunkIndices.get(Number(entity.getRuntimeId()));
            if (chunkIndex !== undefined) return chunkIndex;

            const position = entity.getPosition();
            return Chunk.packXZ(Math.floor(position.getX() / 16), Math.floor(position.getZ() / 16));
        });
    }

    /**
     * Sends whatever changed about each entity's attributes this tick, and forgets it.
     *
     * Mirrors {@link World.flushMovement}: the entities record what changed as they change it,
     * and the reporting happens once, here, rather than a packet per write. Health is the one
     * that matters - a mob being hurt three times in a tick is one number to send, not three.
     *
     * Players are skipped on purpose. They drain their own dirty set in `PlayerSession`, which
     * sends them things a mob has no equivalent of - the hunger and experience bars - and doing
     * it here as well would send every one of those twice.
     * @param {Entity[]} entities - Everything in the world, from the top of the tick.
     */
    private async flushEntityAttributes(entities: Entity[]): Promise<void> {
        const updates: Promise<void>[] = [];
        for (const entity of entities) {
            try {
                if (entity instanceof Player) continue;

                const dirty = entity.attributes.getDirty();
                if (dirty.length === 0) continue;

                entity.attributes.clearDirty();
                updates.push(this.changes.entityAttributesChanged(entity, dirty));
            } catch (error: unknown) {
                updates.push(Promise.reject(error));
            }
        }

        await Promise.all(updates);
    }

    /**
     * Brings every player's set of visible entities in line with where they now are.
     *
     * On an interval rather than every tick because it is O(players x entities) and a pass
     * more often than every few ticks buys nothing anybody can see. A player who walks crosses
     * a chunk boundary and forces their own pass immediately - see `PlayerSession.update` - so
     * this interval only really governs entities moving towards a player standing still.
     * @param {number} tick - The current server tick.
     */
    private async updateTracking(tick: number): Promise<void> {
        if (tick % this.server.getConfig().getEntityTrackingInterval() !== 0) return;

        await this.changes.reconcile(this.getEntities());
    }

    /**
     * Tells everyone in this world that an entity has moved.
     *
     * Queued rather than sent, and flushed once at the end of the tick - see
     * {@link PlayerSession.queueMoveActor}, which explains why sending each one on its own made
     * mobs move in fits and starts. A move outside the tick waits at most one tick, which is
     * fifty milliseconds and below anything a player can see.
     *
     * It only announces. The entity was refiled when its position was written, through
     * {@link World.entityRelocated}, whether or not the move is announced.
     * @param {Entity} entity - The entity that moved.
     * @param {boolean} teleport - Whether clients should snap instead of interpolate.
     */
    public async broadcastMove(entity: Entity, teleport = false): Promise<void> {
        this.changes.entityMoved(entity, teleport);
    }

    /**
     * Files a non-player entity under the chunk it stands in, for chunk save and unload.
     *
     * Kept apart from the entity index on purpose. It follows the body a client is shown, which
     * is what a chunk saves, while the index finds a data-driven mob where the runtime put it,
     * and it files every entity under one chunk while the index files a large box in every cell
     * its footprint overlaps. {@link World.entityRelocated} writes both, so they move together.
     */
    private markEntityChunkChanged(entity: Entity): void {
        if (entity instanceof Player) return;
        const runtimeIdsByChunk = this.runtimeIdsByChunk();

        const runtimeId = entity.getRuntimeId();
        const position = entity.getPosition();
        const nextChunkIndex = Chunk.packXZ(Math.floor(position.getX() / 16), Math.floor(position.getZ() / 16));
        const runtimeIdKey = Number(runtimeId);
        const previousChunkIndex = this.entityChunkIndices.get(runtimeIdKey);

        if (previousChunkIndex !== undefined && previousChunkIndex !== nextChunkIndex) {
            this.chunks.get(previousChunkIndex)?.markEntitiesChanged();
            const previousRuntimeIds = runtimeIdsByChunk.get(previousChunkIndex);
            previousRuntimeIds?.delete(runtimeIdKey);
            if (previousRuntimeIds?.size === 0) runtimeIdsByChunk.delete(previousChunkIndex);
        }
        this.chunks.get(nextChunkIndex)?.markEntitiesChanged();
        this.entityChunkIndices.set(runtimeIdKey, nextChunkIndex);
        let nextRuntimeIds = runtimeIdsByChunk.get(nextChunkIndex);
        if (nextRuntimeIds === undefined) {
            nextRuntimeIds = new Set();
            runtimeIdsByChunk.set(nextChunkIndex, nextRuntimeIds);
        }
        nextRuntimeIds.add(runtimeIdKey);
    }

    private markEntitiesInChunkChanged(chunk: Chunk): void {
        for (const entity of this.entities.values()) {
            if (entity instanceof Player) continue;

            const position = entity.getPosition();
            if (
                Math.floor(position.getX() / 16) === chunk.getX() &&
                Math.floor(position.getZ() / 16) === chunk.getZ()
            ) {
                chunk.markEntitiesChanged();
            }
        }
    }

    /** Sends every player the movement that happened this tick, as one batch each. */
    private async flushMovement(): Promise<void> {
        await this.changes.flushMovement();
    }

    /**
     * The data-driven entities of this world's dimension.
     *
     * What drives every mob's behavior: its components, its goals, its brain, the spawn cycle
     * and the despawn pass.
     * @returns {LiveEntityRuntime} This dimension's runtime.
     */
    public dataEntities(): LiveEntityRuntime {
        return this.server.getEntityRuntime(this.dimension.name);
    }

    /**
     * Notifies nearby data-driven block sensors that one block broke.
     * @param position - The integer position of the broken block.
     * @param identifier - The namespaced identifier of the broken block.
     * @param sourceId - The runtime id of the player or entity that broke it, when known.
     */
    public notifyBlockBreak(position: ContentPosition, identifier: string, sourceId?: number): void {
        this.dataEntities().runtime.blockBroken(position, identifier, sourceId);
    }

    /**
     * Registers a listener for Java game events in this dimension.
     *
     * Listeners are stored in the chunk section containing their position.
     * Call {@link World.moveGameEventListener} after a dynamic listener moves.
     *
     * @returns A function that unregisters the listener.
     */
    public addGameEventListener(listener: GameEventListener): () => void {
        return this.gameEventListeners().add(listener);
    }

    /** Re-files a dynamic game-event listener after its position changes. */
    public moveGameEventListener(listener: GameEventListener): void {
        this.gameEventListenerRegistry?.move(listener);
    }

    /** Removes a listener from this world's game-event registries. */
    public removeGameEventListener(listener: GameEventListener): void {
        this.gameEventListenerRegistry?.remove(listener);
    }

    /**
     * Posts one Java game event to listeners in the already-loaded chunks.
     *
     * @param event - The namespaced Java game event.
     * @param at - The integer block position where it occurred.
     * @param sourceId - The runtime id of its source entity, when one caused it.
     */
    public emitGameEvent(event: string, at: ContentPosition, sourceId?: number): void {
        const gameEvent = sourceId === undefined ? { event, at } : { event, at, sourceId };
        this.gameEventListenerRegistry?.post(gameEvent);
    }

    private gameEventListeners(): GameEventListenerRegistry {
        this.gameEventListenerRegistry ??= new GameEventListenerRegistry(this);
        return this.gameEventListenerRegistry;
    }

    /**
     * Get all entities in this world.
     * @returns {Entity[]} the entities.
     */
    public getEntities(): Entity[] {
        return Array.from(this.entities.values());
    }

    /**
     * Hashes loaded chunks, selected pending simulation work, and live entity state for one replay
     * tick.
     *
     * Chunks include blocks, biomes, and block entities. Player inventories are included because
     * duplicate or missing stacks can leave every other world field unchanged. Scheduler queues
     * are copied in processing order; lighting is represented by queue depth only, so this digest
     * compares those boundaries but cannot restore them.
     */
    public replayStateDigest(): string {
        const hash = createHash('sha256');
        const level = this.getLevel();
        const pendingLighting = this.systems.lighting.pending;
        hash.update(
            JSON.stringify({
                dimension: this.getDimension().id,
                seed: this.getSeed().toString(),
                tick: this.getTicks(),
                weather: level.getWeather().saved(),
                gameRules: [...level.getGameRuleManager().getGameRules()],
                // A request already in flight can add a chunk to the simulation later. It is
                // absent from `chunks` until then, so record its packed position and mutable
                // priority as part of the state that will determine future ticks. Sort by the
                // packed position because request arrival order is not world state.
                pendingChunkLoads: [...this.loading]
                    .map(([position, load]) => [position, load.urgency.value] as const)
                    .sort(([left], [right]) => left - right),
                // Physics updates interact in order, and due() leaves the tail after its 4096-update budget.
                pendingBlockUpdates: this.blockUpdates.snapshot(),
                // The scheduler snapshot keeps Java's separate block and fluid lists and tick order.
                pendingScheduledTicks: this.systems.ticks.snapshot(),
                // Random tick positions use Java's own stateful generator, separate from server RNG.
                randomTickState: this.systems.getRandomTickState(),
                // Keep the digest cost bounded; the lighting queue can contain a large flood.
                pendingLighting: { queued: pendingLighting.queued, deferred: pendingLighting.deferred }
            })
        );

        // Chunk map insertion order depends on which player's async request finished first.
        // Sorting makes the digest describe state, not load timing.
        const chunks = [...this.chunks.values()].sort((left, right) =>
            left.getX() === right.getX() ? left.getZ() - right.getZ() : left.getX() - right.getX()
        );
        for (const chunk of chunks) {
            hash.update(`chunk:${chunk.getX()},${chunk.getZ()}:`);
            hash.update(chunk.networkSerialize());
        }

        // Entity map insertion order follows spawn timing; runtime ids sort that order, while
        // leaving the ids out of the hash lets a fresh process compare the same actor state.
        const entities = this.getEntities().sort((left, right) => {
            const leftId = left.getRuntimeId();
            const rightId = right.getRuntimeId();
            return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
        });
        // Data-driven actors keep component state in their runtime until save time, and
        // `persist` writes it onto each body's `persistentNbt`. A digest must not change what it
        // measures: a body that gains a compound here reads as no longer legacy when its chunk
        // reloads. Each body's compound and its record tag are put back once the hash is taken.
        const persisted = entities.map((entity) => {
            const nbt = entity.persistentNbt;
            const record: unknown = nbt?.children.get(DATA_ENTITY_TAG);
            return { entity, nbt, record };
        });
        this.dataEntities().persist();
        try {
            this.hashEntities(hash, entities);
        } finally {
            for (const { entity, nbt, record } of persisted) {
                entity.persistentNbt = nbt;
                if (nbt === null) continue;
                if (record === undefined) nbt.remove(DATA_ENTITY_TAG);
                else nbt.children.set(DATA_ENTITY_TAG, record);
            }
        }

        return hash.digest('hex');
    }

    /** Feeds each entity's saved form, attributes and, for a player, inventory into a digest. */
    private hashEntities(hash: Hash, entities: readonly Entity[]): void {
        for (const entity of entities) {
            const stream = new BinaryStream();
            new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN).writeCompound(EntitySerializer.toNBT(entity));
            hash.update(`entity:${entity.getType()}:`);
            hash.update(stream.getBuffer());
            hash.update(
                JSON.stringify(
                    entity.attributes
                        .getAttributes()
                        .map((attribute) => [
                            attribute.getName(),
                            attribute.getMin(),
                            attribute.getMax(),
                            attribute.getDefault(),
                            attribute.getValue()
                        ])
                        .sort(([left], [right]) => {
                            const leftName = String(left);
                            const rightName = String(right);
                            return leftName < rightName ? -1 : leftName > rightName ? 1 : 0;
                        })
                )
            );

            if (entity instanceof Player) {
                const inventory = entity.getInventory();
                const containers = [inventory, inventory.getArmor(), inventory.getOffhand(), inventory.getEnderChest()];
                const stackCounts = containers.map((container) =>
                    Array.from({ length: container.getSlotCount() }, (_unused, slot) => {
                        const entry = container.getEntry(slot);
                        return entry === null
                            ? null
                            : { entryCount: entry.getCount(), itemCount: entry.getItem().getAmount() };
                    })
                );
                const cursor = inventory.getCursor();

                // A slot can carry two counts that normally agree; preserve both so the digest
                // catches the same split state that can duplicate a stack during inventory moves.
                // The cursor is transient and is not part of storedInventory's persistence record.
                hash.update(
                    JSON.stringify({
                        inventory: storedInventory(inventory),
                        cursor: cursor === null ? null : storedItem(cursor),
                        stackCounts
                    })
                );
            }
        }
    }

    /**
     * One entity, by the id the protocol names it with.
     *
     * The map has always been here; only the array of its values was exposed. Everything that
     * arrives from a client naming an entity - an attack, an interaction, a pick - names it by
     * runtime id, and resolving that by walking `getEntities()` is a linear scan through
     * everything in the world for something the map answers in one step.
     * @param {bigint} runtimeId - The entity's runtime id.
     * @returns {Entity | null} The entity, or null if nothing here has that id.
     */
    public getEntity(runtimeId: bigint): Entity | null {
        return this.entities.get(Number(runtimeId)) ?? null;
    }

    /**
     * Where every entity of this world is now, data-driven and legacy alike.
     *
     * The dimension's one index (ADR 0007), which the entity runtime owns. A position write is
     * visible to the next query, and every query answers in ascending runtime id order.
     * @returns {EntityIndex} The index, for asking what is near a point.
     */
    public getEntityIndex(): EntityIndex {
        return this.dataEntities().runtime.index;
    }

    /**
     * Refiles an entity after its position was written, which {@link Entity.relocate} calls.
     *
     * The one writer of both structures that say where a legacy entity is: the entity index,
     * and the chunk membership that chunk save and unload read. Only for an entity this world
     * holds: one on its way in from another world is filed by {@link World.addEntity} once it
     * arrives.
     * @param {Entity} entity - The entity that moved.
     * @internal
     */
    public entityRelocated(entity: Entity): void {
        if (this.entities.get(Number(entity.getRuntimeId())) !== entity) return;
        this.getEntityIndex().refileLegacy(entity);
        this.markEntityChunkChanged(entity);
    }
    /**
     * Get all players in this world.
     * @returns {Player[]} the players.
     */
    public getPlayers(): Player[] {
        return Array.from(this.players.values()).filter((player) => player.isOnline());
    }

    /**
     * Saves changed chunks into disk.
     *
     * In batches with a yield between them, for the same reason the preload runs in batches:
     * writing a chunk is synchronous, so `Promise.all` over every changed chunk was one
     * uninterrupted run of work. The first autosave after a start region preload has all 441
     * chunks to write and held the event loop for ten seconds - the server froze solid, and
     * the tick loop came back announcing it had skipped two hundred ticks.
     *
     * A failed chunk write is logged and left dirty for retry. Other chunks in the pass still
     * save, and the next pass tries the failed chunk again.
     */
    public async saveChunks(): Promise<void> {
        await this.writeChunks(false);
    }

    /** Writes changed chunks, failing when a replay checkpoint could not persist one. */
    private async writeChunks(requireSuccess: boolean): Promise<void> {
        const timer = new Timer();
        this.server.getLogger().info(`Saving chunks for level ${this.getFormattedName()}`);

        // A data-driven mob's state lives in the runtime, and the chunk serializer only ever
        // sees the body. This is where the two meet, once per save rather than once per tick.
        this.dataEntities().persist();
        const saveContext = this.chunkSaveContext();

        const entityChunks = new Set(this.entityChunkIndices.values());
        const changed = Array.from(this.chunks.values()).filter(
            (chunk) => chunk.getHasChanged() || entityChunks.has(Chunk.packXZ(chunk.getX(), chunk.getZ()))
        );
        for (let i = 0; i < changed.length; i += SAVE_BATCH_SIZE) {
            for (const chunk of changed.slice(i, i + SAVE_BATCH_SIZE)) {
                try {
                    await this.getProvider().writeChunk(chunk, saveContext);
                } catch (error: unknown) {
                    chunk.markChanged();
                    this.server
                        .getLogger()
                        .error(
                            `Failed to save chunk ${chunk.getX()},${chunk.getZ()}; it remains dirty for a later retry`
                        );
                    this.server.getLogger().error(error);
                    // Replay capture cannot use this chunk's stale persisted state as its baseline.
                    if (requireSuccess) throw error;
                }
            }

            if (i + SAVE_BATCH_SIZE < changed.length) await new Promise((resolve) => setImmediate(resolve));
        }

        this.server.getLogger().verbose(`(took §e${timer.stop()} ms§r)!`);
    }

    /**
     * Writes this world to disk: every player in it, every changed chunk, the level data.
     *
     * Queued behind whatever save is already running rather than run beside it. A caller that
     * asks for a save gets one, so this waits its turn instead of declining like the autosave
     * does, but it never writes at the same time as another pass.
     */
    public async save(): Promise<void> {
        await this.enqueueSave();
    }

    /**
     * Saves players and chunks for a replay checkpoint, propagating persistence errors.
     *
     * Ordinary autosaves log failed writes and retry them later. A replay snapshot must fail
     * instead, because copying the provider after a swallowed error would capture stale state.
     */
    public async saveForReplay(): Promise<void> {
        await this.enqueueSave(async () => {
            // Wait for every player write before returning, so a failed capture cannot leave
            // another record write running while the provider snapshot is abandoned.
            for (const player of this.getPlayers()) await this.savePlayerData(player, true);
            await this.writeChunks(true);
        });
    }

    /**
     * Starts an autosave unless a save is already running.
     *
     * Skipped rather than queued, which is the one way this differs from {@link World.save}. A
     * pass still going when the next falls due has more to write than two minutes of ticks
     * allowed, and queueing would answer that with an ever-growing backlog of passes over the
     * same chunks. Nothing is lost by skipping, because a chunk this pass does not reach is
     * still dirty and the next one picks it up.
     */
    private beginAutoSave(): void {
        if (this.saving !== null) return;

        // Nothing awaits this - the tick that started it is over by the time it finishes - so
        // a rejection escaping would be an unhandled one, and the server runs with
        // `--unhandled-rejections=strict`. A save that fails is worth a log line and the next
        // pass; it is not worth the process.
        this.enqueueSave().catch((error: unknown) => {
            this.server.getLogger().error(`Failed to save level ${this.getFormattedName()}`);
            this.server.getLogger().error(error);
        });
    }

    /**
     * Runs one world or chunk write once the write before it has finished.
     *
     * Two passes over the same chunks at once would race on `Chunk.markSaved`. The one that
     * finished second would clear the flag for a write the other had not made yet, and that
     * change would never reach disk. Serializing them here rather than at each call site is
     * what makes that impossible rather than merely unlikely, and it is what lets
     * {@link World.disable} close the provider knowing no write is outstanding.
     *
     * {@link World.saving} holds a promise that settles when the running pass is done and
     * never rejects, so waiting for a predecessor cannot fail on its behalf. The pass's own
     * failure still reaches whoever awaited this.
     */
    private async enqueueSave(write: () => Promise<void> = () => this.write()): Promise<void> {
        const previous = this.saving;

        let finished!: () => void;
        const slot = new Promise<void>((resolve) => {
            finished = resolve;
        });
        // Taken in the same turn this was called, before any await, so a shutdown arriving on
        // the next turn finds the promise to wait for.
        this.saving = slot;

        try {
            await previous;
            await write();
        } finally {
            // Only when nothing has queued behind this, so the last pass in a chain is the one
            // that clears the slot.
            if (this.saving === slot) this.saving = null;
            finished();
        }
    }

    /** One pass over everything, with nothing queued in front of it. */
    private async write(): Promise<void> {
        // `forEach` discards the promise an async callback returns, so these writes used to
        // be in flight - and their failures unobserved - long after `save` had resolved.
        // A shutdown save could return before a single player had reached disk.
        await Promise.all(this.getPlayers().map(async (player) => this.savePlayerData(player)));
        await this.saveChunks();
        await this.saveLevelData();
    }

    /** The level this world is one dimension of. */
    public getLevel(): Level {
        return this.level;
    }

    /** The stem this world was built from: its dimension type id and its generator definition. */
    public getStem(): LevelStem {
        return this.stem;
    }

    /** The level's game rules, which every world of the save shares. */
    public getGameRuleManager(): GameRuleManager {
        return this.level.getGameRuleManager();
    }

    /**
     * How many chunk loads are in flight: read from disk or generating, and not in the world yet.
     * A load whose chunk is ready and waits only for the next input step to admit it is not
     * counted, because only a tick moves it on.
     */
    public getPendingChunkLoadCount(): number {
        let reading = 0;
        for (const load of this.loading.values()) if (!load.parked) reading++;
        return reading;
    }

    /** The level's clock, which every world of the save shares. */
    public getTicks(): number {
        return this.level.getTicks();
    }

    /** Sets the level's clock, which is what `/time set` does. */
    public setTicks(tick: number): void {
        this.level.setTicks(tick);
    }

    /** The level's provider, which serves every dimension of the save. */
    public getProvider(): BaseProvider {
        return this.level.getProvider();
    }

    /**
     * Tells everyone in this world that a game rule changed. Called by the level, whose rules
     * these are, for each of its worlds.
     */
    public async announceGameRule(name: string, value: boolean | number, editable: boolean): Promise<void> {
        await this.changes.gameRuleChanged(name, value, editable);
    }

    // This is used for example in start game packet
    public getUUID(): string {
        return this.uuid;
    }

    public getName(): string {
        return this.name;
    }
    public getFormattedName(): string {
        // The level and the dimension it is, not the generator: every generated world is called
        // `minecraft:noise`, which says nothing about which one a log line is about.
        return `§b'${this.name}'/${this.dimension.id}§r`;
    }

    /**
     * The seed every generated chunk, structure placement and carver in this world comes from.
     *
     * A 64-bit value, as Java's is. It was a `number` until it turned out that a seed above
     * 2^53 arrived here rounded, which generated a world the player had not asked for.
     */
    public getSeed(): bigint {
        return this.level.seed;
    }

    /**
     * Which dimension this world is, and therefore how tall it is and where its floor sits.
     *
     * Resolved once from the stem's type by the level. The chunk stack, the disk format and
     * the portal rules all read it from here, so none of them carries its own copy.
     */
    public getDimension(): DimensionType {
        return this.dimension;
    }

    /**
     * Writes the level's metadata through the provider: the spawn, the clock, the rules, the
     * weather and the stems. The level's, because Bedrock keeps one of each per save; kept
     * here so `/setworldspawn` and the autosave reach it through the world they hold.
     */
    public async saveLevelData(): Promise<void> {
        await this.level.saveLevelData();
    }

    /**
     * Get the player data for a player.
     * @param {Player} player - The player to get the data for.
     * @returns {Promise<WorldPlayerData>} The player data.
     */
    public async getPlayerData(player: Player): Promise<Partial<WorldPlayerData>> {
        const key = World.playerDataKey(player);
        const data = await this.level.getPlayerData(key);
        if (data) return data;

        // Missing player data is the ordinary case - it is what a first join looks like - so
        // this is a debug line and not an error. It used to raise "Player has no XUID" for
        // anybody unauthenticated and log that as a failure on every single join, which is a
        // thing `LoginHandler` explicitly permits and `savePlayerData` has always written a
        // record for.
        this.server.getLogger().debug(`PlayerData is missing for player ${key}`);

        // No position: a player who has never been here is placed by `placePlayerSpawn`,
        // which needs to know that rather than be handed the raw spawn point.
        return { gamemode: this.server.getConfig().getGamemode() };
    }
    /**
     * What a player's data file is named after.
     *
     * The XUID when there is one, and the name when there is not. An offline player has no
     * XUID by construction, and this server accepts offline players, so the fallback is the
     * normal path rather than a defensive one - which is why the reader and the writer have
     * to agree on it in one place rather than each spelling it out.
     */
    private static playerDataKey(player: Player): string {
        return player.getXUID() || player.getName();
    }

    /**
     * Writes a player's record into the level, filed under {@link World.playerDataKey} and
     * stamped with this world's dimension so the next login puts them back here.
     *
     * @param requireSuccess - Propagate a persistence error when creating a replay checkpoint.
     */
    public async savePlayerData(player: Player, requireSuccess = false): Promise<void> {
        const data = {
            // Serialised explicitly: the uuid is a parsed object now, and letting JSON have
            // its way with it would write out the four raw parts instead of the identity.
            uuid: player.getUUID().toString(),
            username: player.getName(),
            gamemode: getGametypeName(player.gamemode),
            flying: player.isFlying(),
            position: {
                x: player.getPosition().getX(),
                y: player.getPosition().getY(),
                z: player.getPosition().getZ(),
                pitch: player.pitch,
                yaw: player.yaw,
                headYaw: player.headYaw
            },
            dimension: this.getDimension().id,
            advancements: storedAdvancements(player),
            enchantmentSeed: enchantmentSeedOf(player),
            inventory: storedInventory(player.getInventory()),
            health: player.getHealth(),
            food: player.getFood(),
            saturation: player.getSaturation(),
            experience: {
                level: player.attributes.getValue(AttributeIds.PlayerLevel),
                progress: player.attributes.getValue(AttributeIds.PlayerExperience)
            },
            attributes: Object.fromEntries(
                player.attributes.getAttributes().map((attribute) => [
                    attribute.getName(),
                    {
                        min: attribute.getMin(),
                        max: attribute.getMax(),
                        base: attribute.getDefault(),
                        current: attribute.getValue()
                    }
                ])
            ),
            // Written whether or not the player has a spawn point of their own, because a
            // record is the whole state: leaving the field out of a save after `/kill` would
            // keep a bed this player no longer has.
            ...(player.getSpawnPoint() === undefined ? {} : { spawn: player.getSpawnPoint() }),
            portalCooldown: player.getPortalCooldown(),
            seenCredits: player.hasSeenCredits(),
            savedAt: Date.now()
        } satisfies WorldPlayerData;

        await this.level.savePlayerData(World.playerDataKey(player), data, requireSuccess);
    }

    /**
     * @returns {Server} The server instance.
     */
    public getServer(): Server {
        return this.server;
    }
}
