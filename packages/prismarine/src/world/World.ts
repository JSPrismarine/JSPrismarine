import GameRuleManager, { GameRules } from './GameRuleManager';

import fs from 'node:fs';

import { Vector3 } from '@jsprismarine/math';
import { Gametype, getGametypeName, LevelEvent, LevelSoundEvent } from '@jsprismarine/minecraft';
import type { Block, Server, Service } from '../';
import Timer from '../utils/Timer';
import UUID from '../utils/UUID';
// Imported straight from its module rather than through the barrel: `index.ts` exports
// `./world/` before `Player`, so reaching for it via '../' lands back in a module that is
// still initializing and the binding is not a constructor yet when `instanceof` runs.
import Player from '../Player';
import { advancementPlacedBlock } from '../advancement/triggers';
import { storedAdvancements } from '../advancement/progress';
import { enchantmentSeedOf } from '../enchantment/enchantingTable';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import type { BlockState } from '../block/state/BlockState';
import { AttributeIds } from '../entity/Attribute';
import { spawnableEntities } from '../entity/Entities';
import type { LiveEntityRuntime } from '../entity/data/live';
import EntitySerializer from '../entity/EntitySerializer';
import { Item as ItemEntity } from '../entity/other/Item';
import type { Entity } from '../entity/Entity';
import { Mob } from '../entity/Mob';
import ContainerEntry from '../inventory/ContainerEntry';
import { storedInventory } from '../inventory/persistence';
import { Item } from '../item/Item';
import type { ActorEvent } from '../network/packet/ActorEventPacket';
import BlockUpdateScheduler from './BlockUpdateScheduler';
import { breakBlockWithContent, collectBreakDrops } from './blockBreak';
import { notifyContentNeighbors } from './neighborContent';
import CoordinateUtils from './CoordinateUtils';
import EntityGrid from './EntityGrid';
import type { WorldChangeSink } from './WorldChangeSink';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';
import { Dimensions } from './Dimension';
import MobSpawner from './MobSpawner';
import { placePlayerSpawn } from './SpawnPlacement';
import BlockPhysics from './physics/BlockPhysics';
import type { DimensionDefinition } from './Dimension';
import type { LevelData, WorldConfig, WorldPlayerData } from '../config/JsonConfigTypes';
import { Position } from './Position';
import type { PlayerSpawn, RelocationOffset } from './SpawnPlacement';
import Progress from '../utils/Progress';
import { withCwd } from '../utils/cwd';
import { readJsonFile, writeJsonFile } from '../config/JsonFile';
import type { Generator } from './Generator';
import { canSpreadFireAround, createEngineWorld } from './EngineWorld';
import type { RandomTickChunk, SystemBlock, WorldSystemsOptions } from './WorldSystems';
import { WorldSystems } from './WorldSystems';
import { DEFAULT_RANDOM_TICK_SPEED } from '@jsprismarine/engine-systems';
import Chunk from './chunk/Chunk';
import type BaseProvider from './providers/BaseProvider';
import type Provider from './providers/Provider';

export type { FlatLayer, LevelData, WorldConfig, WorldPlayerData } from '../config/JsonConfigTypes';

/** How far out to look for dry land, and how coarsely, before giving up. */
const SPAWN_SEARCH_RADIUS = 256;
const SPAWN_SEARCH_STEP = 8;

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

/** Chunks generated between yields to the event loop while preloading. */
const PRELOAD_BATCH_SIZE = 32;

/**
 * Chunks written between yields to the event loop while saving.
 *
 * Smaller than the preload's batch because a save happens while players are connected: eight
 * chunks is a couple of milliseconds, so a tick that lands mid-save is late rather than lost.
 */
const SAVE_BATCH_SIZE = 8;

/**
 * How far from a player the world simulates, in chunks.
 *
 * Java Edition's `simulation-distance` default, and a separate thing from how far a client is
 * sent chunks: a player sees terrain they are not simulating. A chunk outside every player's
 * radius stays in memory and stays still, which is Java's own rule and the reason an empty
 * server costs nothing to run.
 */
export const SIMULATION_DISTANCE = 10;

/**
 * Which way a block goes when placed against each face, indexed by the face the client sent:
 * bottom, top, front, back, right, left.
 */
const FACE_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
    [0, -1, 0],
    [0, 1, 0],
    [0, 0, -1],
    [0, 0, 1],
    [-1, 0, 0],
    [1, 0, 0]
];

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

const LEVEL_DATA_FILE_NAME = 'level.json';
const WORLDS_FOLDER_NAME = 'worlds';

export interface WorldData {
    name: string;
    path: string;
    server: Server;
    provider: BaseProvider;
    seed: number;
    generator: Generator;
    config?: WorldConfig;
    /** Defaults to the Overworld, which is the only one the server generates today. */
    dimension?: DimensionDefinition;
    /**
     * What to run when a random tick lands on a block, keyed by block identifier.
     *
     * The world draws the positions and `@jsprismarine/engine-systems` filters them; what a
     * crop, a fire or a melting block then does is the behavior families' business, so it
     * arrives from outside. Left out, the draws still happen and nothing answers them.
     */
    randomTickHandlers?: WorldSystemsOptions['randomTickHandlers'];
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
    private readonly uuid: string = UUID.randomString();
    private name: string;

    private readonly entities: Map<bigint, Entity> = new Map();
    private readonly entityChunkIndices = new Map<bigint, number>();

    /** Where everything is, bucketed once a tick so mobs can ask who they are touching. */
    private readonly entityGrid = new EntityGrid();

    /**
     * The subset of `entities` that are player-controlled, kept alongside it.
     *
     * `getPlayers()` is called on essentially every broadcast, and deriving it meant walking
     * every entity in the world each time. Holding the players separately makes that a read.
     */
    private readonly players: Map<bigint, Player> = new Map();
    private readonly chunks: Map<number, Chunk> = new Map();

    /** The last chunk {@link getLoadedChunk} answered with. A packed key is never negative. */
    private lastChunkIndex = -1;
    private lastChunk: Chunk | null = null;
    private lastChunkSource: Map<number, Chunk> | null = null;

    private readonly gameRuleManager: GameRuleManager;
    private currentTick = 0;

    /** Two minutes at the server's twenty ticks per second. */
    private static readonly AUTO_SAVE_INTERVAL_TICKS = 20 * 120;
    private readonly provider: BaseProvider & Provider;
    private readonly server: Server;
    private readonly seed: number;
    private readonly generator: Generator;
    private readonly config: WorldConfig;
    private readonly dimension: DimensionDefinition;
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
     * Set once the provider has gone, after which there is nothing left to read or write.
     *
     * Separate from {@link World.closing} because the shutdown's own save happens between the
     * two, and that save has to be allowed to write.
     */
    private closed = false;

    /**
     * The start region work while it is running, so a shutdown can wait for it rather than
     * race it. Null the rest of the time.
     */
    private starting: Promise<void> | null = null;

    /**
     * Puts wildlife into the world near players and takes it away behind them.
     *
     * The fallback for a server with `content-packs` off. With it on, the data-driven runtime
     * of {@link World.dataEntities} does both halves from the loaded spawn rules instead.
     */
    private readonly mobSpawner: MobSpawner;

    /** Positions waiting to react to a nearby change, and what they do about it. */
    private readonly blockUpdates = new BlockUpdateScheduler();
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

    public constructor({ name, server, provider, seed, generator, config, dimension, randomTickHandlers }: WorldData) {
        this.name = name;
        this.server = server;
        this.provider = provider;
        // A rule set after this point goes out to everyone in the world through the sink, the
        // same route the clock takes. `this.changes` is read when the rule changes, not now,
        // so the replicator attached later is the one that hears it.
        this.gameRuleManager = new GameRuleManager(server, (name, value, editable) => {
            this.changes.gameRuleChanged(name, value, editable).catch((error: unknown) => {
                this.server.getLogger().error(`Failed to send game rule ${name}: ${error}`);
            });
        });
        this.seed = seed;
        this.generator = generator;
        this.config = config ?? {};
        this.dimension = dimension ?? Dimensions.Overworld;
        this.mobSpawner = new MobSpawner(this);
        this.physics = new BlockPhysics(this);
        this.systems = new WorldSystems({
            view: {
                dimension: this.dimension,
                blockAt: (x, y, z) => this.loadedBlockAt(x, y, z),
                loadedChunks: () => Array.from(this.chunks.values(), (chunk) => ({ x: chunk.getX(), z: chunk.getZ() })),
                randomTickSpeed: () => {
                    const [value] = this.gameRuleManager.getGameRule(GameRules.RandomTickSpeed) ?? [];
                    return typeof value === 'number' ? value : DEFAULT_RANDOM_TICK_SPEED;
                },
                randomTickChunks: () => this.randomTickChunks()
            },
            world: createEngineWorld(this),
            // `minecraft:fire_spread_radius_around_player`, read per fire tick. Fire is the
            // one engine system whose rule needs the player list, and the engine has none.
            canSpreadFireAround: (at) => canSpreadFireAround(this, at),
            // The blocks that answer a random tick are the behavior families in
            // `@jsprismarine/block-behaviors`, reached through the content world adapter, so
            // `WorldManager` builds these from the content registries and leaves them out when
            // `content-packs` is off. The positions are drawn either way, so the draw sequence -
            // which decides where crops grow - does not shift with them.
            randomTickHandlers
        });

        this.gameRuleManager.setGameRule(GameRules.ShowCoordinates, true, true);

        try {
            // Create folders if they don't exist.
            const path = withCwd(WORLDS_FOLDER_NAME, this.name, 'playerdata');
            if (!fs.existsSync(path)) fs.mkdirSync(path, { recursive: true });
        } catch (error: unknown) {
            this.server.getLogger().error(`Failed to create world folders for ${this.name}`);
            this.server.getLogger().error(error);
        }
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
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        // Deliberately *not* subscribed to the server's tick event. The server already calls
        // `update` on every world in its tick, and doing both ran each world - and so every
        // entity in it - twice per tick. Time itself went at double speed: breath ran out in
        // seven seconds instead of fifteen and drowning took four half-hearts a second
        // instead of two. The server's call is the one to keep, and the duplication is the
        // whole of the reason - the tick event is awaited inside the tick's budget now too,
        // so subscribing would buy nothing and cost a second update.

        const level = await this.getLevelData();
        if (level.spawn) this.setSpawnPosition(Vector3.fromObject(level.spawn));
        if (level.gameRules) {
            level.gameRules.forEach(([name, [value, editable]]) =>
                this.gameRuleManager.setGameRule(name, value, editable)
            );
        }
        if (level.entities) {
            for (const entityData of level.entities) {
                const Entity = spawnableEntities().find((e) => e.MOB_ID === entityData.type);
                if (!Entity) {
                    this.server.getLogger().warn(`Entity type ${entityData.type} not found`);
                    continue;
                }

                // The saved coordinates are actually used now. They used to be spread into
                // an options object that had no place for them, so every entity restored
                // from disk silently reappeared at the origin.
                const { x, y, z } = entityData.position;
                const entity = new Entity({ position: new Position(x, y, z, this) });

                // Written to the save file, so it was here on purpose and stays.
                if (entity instanceof Mob) entity.setPersistent();

                await this.addEntity(entity);
            }
        }

        this.provider.setWorld(this);
        await this.provider.enable();

        this.starting = this.prepareStartRegion();
        try {
            await this.starting;
        } finally {
            this.starting = null;
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
        await this.getSpawnPosition();
        await this.preloadSpawnRegion();
    }

    /**
     * On disable hook.
     *
     * The order is the whole of it. Marking the world closing stops the preload asking for
     * more chunks and stops the tick; waiting for the start region means every chunk that was
     * generated is in `this.chunks` before the save walks it; and the provider is closed last,
     * once nothing is left that could ask it for anything.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        this.closing = true;

        // A start region that failed has already been reported to whoever awaited `enable`;
        // the save still has to happen, so its failure must not take this path down with it.
        await this.starting?.catch(() => {});

        await this.save();
        await this.provider.disable();
        this.closed = true;
    }

    public getGenerator(): Generator {
        return this.generator;
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

        // TODO: tick chunks

        // Continue world time ticks
        this.currentTick++;

        // Auto save every 2 minutes. The interval has to be a remainder rather than an
        // equality: `currentTick / 20 === 120` holds for exactly one value of the counter,
        // so the world was saved once, two minutes in, and then never again for the rest
        // of the process' life.
        if (this.currentTick % World.AUTO_SAVE_INTERVAL_TICKS === 0) {
            await this.save();
        }

        // Before the entities, so a mob walks on the world as it is this tick rather than as it was
        // before the sand under it fell away.
        await this.runBlockUpdates();

        // Java's order: the two scheduled tick lists, then the chunk tick that draws the random
        // positions, then the light the writes above queued. Budgeted, so one tick cannot stall
        // on a light flood or a backlog of fluid ticks.
        this.systems.tick(this.currentTick);

        const entities = this.getEntities();

        // Also before them, and for the same reason: every mob asks who it is touching, and it has
        // to be answered from where everything was at the top of the tick. Rebuilding it inside
        // the loop would let a mob be pushed by a neighbor that had already moved and not by one
        // that had not, which makes the shove depend on map iteration order.
        this.entityGrid.rebuild(entities);

        await Promise.all(entities.map((entity) => entity.update(tick)));

        // The data-driven entities, after the written ones: a data entity's body is a
        // `GenericEntity` whose own update does nothing, so the loop above has already run the
        // half of it that the class hierarchy owns and this runs the half the components do.
        const live = this.dataEntities();
        await live?.tick(tick);

        // Straight after the updates that changed them, and before the spawner can add anything
        // whose attributes have not been touched yet. Read again rather than reused: the data
        // runtime's spawn cycle has put bodies in the world since the list above was taken.
        await this.flushEntityAttributes(live === undefined ? entities : this.getEntities());

        // `@jsprismarine/spawning` runs the six-step cycle inside the data runtime above, with
        // Bedrock's caps and cadences and the sixty vanilla spawn rules. `MobSpawner` is the
        // fallback for a server with `content-packs` off, which has no spawn rules to run.
        if (live === undefined) await this.mobSpawner.tick(tick);

        // After everything has moved but before the movement goes out, so an entity that came
        // into range this tick is spawned before the first packet that says it moved.
        await this.updateTracking(tick);

        // After physics and after the entities, both of which change blocks, so a tick's block
        // changes leave as one batch per player rather than one packet each - see
        // `flushBlockChanges`. Before the movement, so a mob is not reported walking on ground the
        // client has not been told about yet.
        await this.changes.flushBlockChanges();

        // After every entity has moved, so a tick's movement leaves as one batch per player rather
        // than one per mob - see `flushMovement`.
        await this.flushMovement();
        await this.sendTime();
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
     * come out of the same catalog the block manager answers from. The properties travel
     * with the name, so a lit lamp, a half slab and a stair on its side each read their own
     * facts rather than the ones their default state has.
     * @throws When no registry names the block the chunk holds, which is a corrupt chunk or
     * a world saved against a plugin that is no longer loaded. This used to answer air,
     * and air is a position a caller is free to build in, so the block was lost on the next
     * write.
     */
    public async getBlock(x: number, y: number, z: number, layer = 0): Promise<Block> {
        const state = (await this.getChunkAt(x, z)).getBlock(x, y, z, layer);
        const block = this.server.getBlockManager().findBlock(state.name, state.properties);
        if (!block) {
            throw new Error(`No block named ${state.name}, held at ${x} ${y} ${z} in world ${this.getName()}`);
        }

        return block;
    }

    /**
     * Returns the chunk in the specifies x and z, if the chunk doesn't exists
     * it is generated.
     */
    public async getChunk(cx: number, cz: number): Promise<Chunk> {
        const index = Chunk.packXZ(cx, cz);
        if (!this.chunks.has(index)) return this.loadChunk(cx, cz);

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
     * through this. The cache is one entry and is dropped whenever {@link chunks} gains one, so
     * the only way to make it lie is to remove a chunk from the map without going through
     * {@link loadChunk} - which nothing does, since chunks are never unloaded.
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
     * The batch is also the unit a shutdown interrupts. Generating 441 chunks takes about
     * fifteen seconds, and a dev restart almost always lands inside that, so this gives up as
     * soon as {@link World.disable} says to rather than generating terrain for a world that
     * is being closed. Whatever was generated by then is saved; the rest is generated on
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
            await Promise.all(batch.map(async ([x, z]) => this.loadChunk(x, z, true)));
            prepared += batch.length;

            progress.advance(batch.length);
            // Hand the loop back so the bar paints and the socket stays responsive.
            await new Promise((resolve) => setImmediate(resolve));
        }

        progress.finish();
    }

    /**
     * Loads a chunk in a given x and z and returns its.
     * @param {number} x - x coordinate.
     * @param {number} z - z coordinate.
     * @throws {Error} When the world has been closed, since its provider is gone and a chunk
     * generated now would be generated after the save that was meant to persist it.
     */
    public async loadChunk(x: number, z: number, _ignoreWarn?: boolean): Promise<Chunk> {
        // Refused here rather than left to the provider, which answers with "The world
        // provider is not enabled" - the symptom, not the reason. The caller asked a world
        // that has shut down for a chunk, and that is what it should be told.
        if (this.closed) throw new Error(`Cannot load chunk ${x},${z}: world ${this.name} has been closed`);

        const index = Chunk.packXZ(x, z);
        // Try - catch for provider errors
        const chunk = await this.provider.readChunk(x, z, this.seed, this.generator, this.config);
        this.chunks.set(index, chunk);
        // The only thing that changes what `getLoadedChunk` should answer.
        this.lastChunkIndex = -1;
        this.markEntitiesInChunkChanged(chunk);

        // After the chunk is in the map: the engine reads the blocks back through the world.
        this.systems.onChunkLoaded(x, z);

        await this.createStoredEntities(chunk);
        await this.createGeneratedEntities(chunk);

        // TODO: event here, eg onChunkLoad
        return chunk;
    }

    /** Restores the actor NBT the provider read for this chunk. */
    private async createStoredEntities(chunk: Chunk): Promise<void> {
        for (const nbt of chunk.takeStoredEntities()) {
            if (nbt.getString('identifier', '') === 'minecraft:player') continue;

            const entity = EntitySerializer.fromNBT(nbt, this);
            const legacyEntity = this.getEntities().find((candidate) => this.isLegacyEntity(candidate, entity));
            if (legacyEntity) await this.removeEntity(legacyEntity);

            if (entity instanceof Mob) entity.setPersistent();
            await this.addEntity(entity);
        }
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
            const Entity = spawnableEntities().find((candidate) => candidate.MOB_ID === spawn.type);
            if (!Entity) {
                this.server.getLogger().debug(`World generation asked for ${spawn.type}, which has no entity class`);
                continue;
            }

            const entity = new Entity({
                position: new Position(spawn.x, spawn.y, spawn.z, this),
                yaw: spawn.yaw ?? 0,
                headYaw: spawn.yaw ?? 0
            });

            // A village's inhabitants belong to the village. The spawner tidies away mobs nobody is
            // near, and a village that emptied itself the first time you left would be worse than
            // no village at all.
            if (entity instanceof Mob) entity.setPersistent();

            await this.addEntity(entity);
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
     * One swing against a block: the sound of the hit and the chips that come off it.
     *
     * Struck, not broken. `START_BLOCK_CRACKING` was the only thing sent while mining, and
     * that is the progress overlay - it draws the cracks spreading and makes no sound at all,
     * which is why digging was silent until the block gave way.
     *
     * The material comes from the runtime id, the same way the break sound gets it: the client
     * looks the block up and plays whatever that block is made of.
     * @param {Vector3} position - The block being struck.
     * @param {number} face - Which side was hit; the chips come off that one.
     */
    public async hitBlock(position: Vector3, face: number): Promise<void> {
        const state = await this.getBlockState(position.getX(), position.getY(), position.getZ());
        if (state.name === 'minecraft:air') return;

        const runtimeId = BlockRuntimeIds.get(state);

        this.changes.blockSound(position, LevelSoundEvent.HIT, runtimeId);

        const particles = CRACK_PARTICLES[face];
        if (particles !== undefined) await this.sendWorldEvent(position, particles, runtimeId);
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
        if (this.spawn) return this.spawn;

        this.spawn = await this.findSurfaceSpawn();
        return this.spawn;
    }

    /**
     * Looks outward from the origin for dry ground to stand on.
     *
     * A quarter of this world is ocean, so the origin column is quite likely to be water -
     * and the topmost block of a flooded column *is* water, which is what makes the test
     * for it as simple as it looks. Leaves and flowers are refused as well: they hold a
     * player up, but spawning in a treetop is not what anyone means by a spawn point.
     *
     * The search widens in rings and steps several blocks at a time, because each candidate
     * may generate a chunk and terrain does not change meaningfully between neighbors.
     */
    private async findSurfaceSpawn(): Promise<Vector3> {
        for (let radius = 0; radius <= SPAWN_SEARCH_RADIUS; radius += SPAWN_SEARCH_STEP) {
            for (const [x, z] of World.ringAround(radius, SPAWN_SEARCH_STEP)) {
                const chunk = await this.getChunkAt(x, z);
                const y = chunk.getHighestBlockAt(x, z);
                if (y === null) continue;

                const surface = chunk.getBlock(x & 0xf, y, z & 0xf).name;
                if (UNSUITABLE_SPAWN_SURFACES.has(surface)) continue;

                // The surface block itself, which is how a Bedrock world stores it: players
                // are placed one block above the stored height.
                return new Vector3(x, y, z);
            }
        }

        // Nowhere suitable within the search: better to start above the origin than to
        // refuse to start at all.
        this.server.getLogger().warn(`No dry spawn found for ${this.getFormattedName()}, falling back to the origin`);
        return new Vector3(0, 100, 0);
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

        return placePlayerSpawn(
            await this.getSpawnPosition(),
            {
                minY,
                maxY: minY + height,
                isObstructed: async (x, y, z) => (await this.getBlock(x, y, z)).isSolid(),
                getBlockName: async (x, y, z) => (await this.getBlockState(x, y, z)).name,
                getHighestBlock: async (x, z) => (await this.getChunkAt(x, z)).getHighestBlockAt(x, z)
            },
            random
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
     * Set the world's spawn position.
     * @param {Vector3} pos - The position.
     */
    public setSpawnPosition(pos: Vector3) {
        this.spawn = pos;
    }

    /**
     * The spawn point if it has already been found, and null while it has not.
     *
     * {@link World.getSpawnPosition} searches for dry land the first time it is asked, which
     * is why it is asynchronous. A caller inside the tick cannot wait for that search, so it
     * gets what the world knows now.
     * @returns {Vector3 | null} The spawn point, or null before it has been resolved.
     */
    public getKnownSpawnPosition(): Vector3 | null {
        return this.spawn;
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
        this.changes.namedSound(new Vector3(x + 0.5, y + 0.5, z + 0.5), sound);
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
        this.changes.namedParticle(new Vector3(x + 0.5, y + 0.5, z + 0.5), particle);
    }

    // TODO: move this?
    public async useItemOn(
        itemInHand: Item | Block | null,
        blockPosition: Vector3,
        face: number,
        clickPosition: Vector3,
        player: Player
    ): Promise<void> {
        // TODO: checks
        // TODO: canInteract

        // An item that names a block is resolved to that block, rather than refused for being
        // an item. Everything a player holds is an `Item` - a creative pick, a stack out of
        // the inventory, a drop picked up off the ground - so returning early here meant the
        // server placed nothing at all, ever. The client predicts the placement and plays the
        // sound locally, which is why a block appeared to go down and then was not there.
        //
        // A name the block registry does not know still places nothing: the state catalog
        // has all 1219 blocks, but only the 260 with a class of their own can be given
        // behavior, and the creative menu now offers every one of the 1919 items.
        const blockManager = this.server.getBlockManager();
        const block = itemInHand instanceof Item ? blockManager.findBlock(itemInHand.getName()) : itemInHand;
        const clickedState = (await this.getChunkAt(blockPosition)).getBlock(blockPosition);
        const clickedBlock = blockManager.findBlock(clickedState.name);

        if (!block || !clickedBlock) return;
        if (clickedBlock.getName() === 'minecraft:air' || !block.canBePlaced()) return;

        let placedPosition = new Vector3(blockPosition.getX(), blockPosition.getY(), blockPosition.getZ());

        // Only set correct face if the block can't be replaced
        if (!clickedBlock.canBeReplaced()) {
            const offset: readonly [number, number, number] | undefined = FACE_OFFSETS[face];
            if (!offset) throw new Error('Invalid Face');

            const [dx, dy, dz] = offset;
            placedPosition = new Vector3(
                placedPosition.getX() + dx,
                placedPosition.getY() + dy,
                placedPosition.getZ() + dz
            );
        }

        if (blockPosition.getY() < 0 || blockPosition.getY() > 255) return;

        // Through `setBlockRuntimeId`, so a placed block sets off the same physics a broken one
        // does: sand placed in mid air falls, a block dropped into a stream dams it, and a block
        // put under a flower holds it up.
        const success: boolean = await new Promise(async (resolve) => {
            try {
                await this.setBlockRuntimeId(
                    placedPosition.getX(),
                    placedPosition.getY(),
                    placedPosition.getZ(),
                    BlockRuntimeIds.getByName(block.getStateName())
                );
                resolve(true);
            } catch (error: unknown) {
                player.getServer().getLogger().warn(`${player.getName()} failed to place block due to ${error}`);
                await player.sendMessage(error instanceof Error ? error.message : String(error));

                resolve(false);
            }
        });

        if (!success) {
            // TODO: tell the client the placement did not happen.
            //
            // A client shows the block the moment it asks for it, so a refused placement
            // leaves a ghost block on screen until something else happens to that position.
            // The revert used to be built here as an `UpdateBlockPacket` carrying
            // `clickedBlock`'s state - and then dropped on the floor, never sent, for as long
            // as the code has existed. The packet is gone rather than the intent: what belongs
            // here is `this.changes.blockChanged(placedPosition, ...)`, which would actually
            // send it, and turning that on is a behavior change rather than a move.
            return;
        }

        const runtimeId = BlockRuntimeIds.getByName(block.getStateName());

        // To the players who can see the block. This went through the session manager, so a
        // block placed here was announced to every player on the server - including those in
        // other worlds entirely.
        this.changes.blockChanged(placedPosition, runtimeId);

        this.changes.blockSound(placedPosition, LevelSoundEvent.PLACE, runtimeId);

        advancementPlacedBlock(player, {
            origin: {
                x: placedPosition.getX(),
                y: placedPosition.getY(),
                z: placedPosition.getZ()
            },
            block: block.getName(),
            tool: itemInHand instanceof Item ? itemInHand : Item.air()
        });
    }

    /**
     * Destroys the block at a position: takes it out of the world, tells every player, and
     * plays the break where it stood.
     *
     * Deliberately idempotent - a position already holding air is left alone and reported as
     * `false`. Breaking is client authoritative here (`StartGamePacket` announces server
     * authoritative block breaking as off), and *which* packet announces a break depends on
     * the game mode: survival sends an InventoryTransaction - on its own or inside the tick's
     * `PlayerAuthInputPacket` - creative a PlayerAction, and a client is free to send both. Rather than guess which one to trust per mode, every
     * route calls this, and whichever arrives second finds the work already done. That is
     * what keeps the break from sounding twice.
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
        // block decides what falls. Undefined with `content-packs` off and for a block no
        // content covers, and the drop this server has always made is the one below.
        const contentDrops = breakBlockWithContent({ world: this, position: { x, y, z }, player });

        // TODO: run a function from block.getBreakConsequences() because the broken block may
        // place more blocks or run block related code, for example ice should replace itself
        // with a water source block in survival.
        //
        // Through `setBlockByName` rather than straight into the chunk, so that everything the
        // block was holding up - a flower on it, sand above it, water beside it - is given its
        // chance to react. That is the whole of what makes breaking a block have consequences.
        await this.setBlockByName(x, y, z, 'minecraft:air');

        // Played at the block. Played at the breaking player, as it once was, it reached the
        // one listener who did not need telling where it happened at zero distance, and
        // everyone else in the wrong place entirely.
        this.changes.blockSound(new Vector3(x, y, z), LevelSoundEvent.BREAK, brokenRuntimeId);

        // The silent variant of the destroy event: the sound is the packet above, and the
        // ordinary one would play it a second time.
        await this.sendWorldEvent(
            new Vector3(x + 0.5, y + 0.5, z + 0.5),
            LevelEvent.PARTICLES_DESTROY_BLOCK_NO_SOUND,
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
            await this.dropContents(
                new Vector3(x + 0.5, y + 0.5, z + 0.5),
                contentDrops ?? broken.getDrops(itemInHand, this.server)
            );
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
        now: number = this.currentTick,
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
        now: number = this.currentTick,
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

        return this.setLoadedBlockRuntimeId(x, y, z, runtimeId, this.currentTick, 1, notifyNeighbors);
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
        if (chunk.getBlockRuntimeId(x & 0xf, y, z & 0xf) === runtimeId) return false;

        // Read before the write: the light engine's decrease wave needs what stood here.
        const previous = chunk.getBlock(x, y, z);
        chunk.setBlockRuntimeId(x & 0xf, y, z & 0xf, runtimeId);
        const state = chunk.getBlock(x, y, z);
        const next: SystemBlock = { name: state.name, states: state.properties };
        this.systems.onBlockChanged({ x, y, z }, { name: previous.name, states: previous.properties }, next);

        this.changes.blockChanged(new Vector3(x, y, z), runtimeId);

        this.blockUpdates.scheduleAround(x, y, z, now, delay);

        // Last, so that everything the change has to report has been reported before a
        // circuit, a fluid or a fire reacts to it and writes the next block. The content
        // families come after the engine systems for the same reason, and they come at all
        // because `createContentBlockGroup().set` used to be the only write that told them:
        // see {@link import('./neighborContent')}.
        if (notifyNeighbors) {
            this.systems.updateAround({ x, y, z }, next);
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
        now: number = this.currentTick,
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

    /** The light engine and the two scheduled tick lists - see {@link WorldSystems}. */
    public getSystems(): WorldSystems {
        return this.systems;
    }

    /**
     * Where this tick's random draws land: Java's `ServerLevel.tickChunks`, in two halves.
     *
     * Only a chunk a player ticket holds is simulated, so an empty server draws nothing at all
     * however much of the world is in memory - which is also why nobody's furnaces burn while
     * they are logged off. And within a chunk, only the sub chunks that hold anything: the
     * three hundred blocks of air over an Overworld column take no random ticks, and drawing
     * for them was most of what an idle world spent its tick on.
     *
     * Java's own section test is stricter still, asking the section's palette whether anything
     * in it takes random ticks at all. A sub chunk that exists and is not empty is the cheap
     * half of that, and the one that removes the twenty-three empty sections.
     * Public for the same reason {@link World.loadedBlockAt} is: {@link WorldSystems} is handed
     * the world's reads rather than the world itself.
     * @returns {RandomTickChunk[]} One entry per simulated chunk, with its occupied sections.
     */
    public randomTickChunks(): RandomTickChunk[] {
        const players = this.getPlayers();
        if (players.length === 0) return [];

        const visited: RandomTickChunk[] = [];
        for (const chunk of this.chunks.values()) {
            const x = chunk.getX();
            const z = chunk.getZ();
            if (!players.some((player) => this.withinSimulationDistance(player, x, z))) continue;

            const sections: number[] = [];
            for (const [index, subChunk] of chunk.getSubChunks()) {
                if (!subChunk.isEmpty()) sections.push(index);
            }
            if (sections.length > 0) visited.push({ x, z, sections });
        }

        return visited;
    }

    /** Whether a chunk is close enough to a player for the world to simulate it. */
    private withinSimulationDistance(player: Player, chunkX: number, chunkZ: number): boolean {
        const position = player.getPosition();
        return (
            Math.abs((Math.floor(position.getX()) >> 4) - chunkX) <= SIMULATION_DISTANCE &&
            Math.abs((Math.floor(position.getZ()) >> 4) - chunkZ) <= SIMULATION_DISTANCE
        );
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
     * Lets every block that came due react.
     *
     * Sequential rather than concurrent on purpose. These updates write blocks, and two of them
     * running at once can both read the same position before either writes it - so a column of
     * falling sand duplicates itself, and water spreads twice into the same hole.
     */
    private async runBlockUpdates(): Promise<void> {
        const due = this.blockUpdates.due(this.currentTick);

        for (const { x, y, z } of due) {
            await this.physics.update(x, y, z, this.currentTick);
        }
    }

    /**
     * Puts items on the ground at a position, one entity each.
     * @param {Vector3} position - where they land.
     * @param {Array} contents - what to drop; nulls are skipped, so a block that drops
     * nothing for the tool used can say so plainly.
     */
    public async dropContents(position: Vector3, contents: Array<Block | Item | null>): Promise<void> {
        // A break running its block's `onBreak` takes what the family drops, so a container's
        // contents can be told from the family's stand-in for the loot table rather than
        // landing beside the roll; see {@link import('./blockBreak')}.
        if (collectBreakDrops(this, contents)) return;

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

        await Promise.all(contents.filter((drop) => drop !== null).map(async (drop) => this.dropItem(position, drop)));
    }

    /**
     * Puts one stack on the ground as a `minecraft:item` entity.
     *
     * A block is turned into the item it becomes once picked up: only an item can go on the
     * wire, and `Block` has no serialisation of its own - which is exactly the cast
     * `ContainerEntry` warns about, made honestly here instead.
     */
    private async dropItem(position: Vector3, drop: Block | Item): Promise<void> {
        const item =
            drop instanceof Item ? drop : new Item({ id: drop.getId(), name: drop.getName(), meta: drop.getMeta() });

        // Built where it lands, so nothing has to be moved into place afterwards and no
        // client is told about a position the entity never actually held.
        const entity = new ItemEntity({
            item: new ContainerEntry({ item, count: item.getAmount() }),
            position: Position.fromVector3(position, this)
        });

        await this.addEntity(entity);

        // Said once per drop, because everything between here and a floating item on screen -
        // the entity, the visibility pass, the actor packet - is invisible from the outside,
        // and "I see no drop" otherwise cannot be told from "no drop was made".
        this.server
            .getLogger()
            .debug(
                `Dropped ${item.getName()} (network id ${item.getNetworkId()}) at ${position.toString()}`,
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
        if (this.currentTick % World.TIME_SYNC_INTERVAL_TICKS !== 0) return;

        await this.changes.timeChanged(this.getTicks());
    }

    /**
     * Adds an entity to the level.
     * @param {Entity} entity - The entity to add.
     */
    public async addEntity(entity: Entity): Promise<void> {
        this.entities.set(entity.getRuntimeId(), entity);
        if (entity instanceof Player) this.players.set(entity.getRuntimeId(), entity);
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
        const runtimeId = entity.getRuntimeId();
        const chunkIndex = this.entityChunkIndices.get(runtimeId);
        if (chunkIndex !== undefined) this.chunks.get(chunkIndex)?.markChanged();
        this.entityChunkIndices.delete(runtimeId);

        this.entities.delete(entity.getRuntimeId());
        this.players.delete(entity.getRuntimeId());

        // Taken out of the maps first, so a leaving player is not among the clients told
        // about its own departure - and so nothing is announced to a session on its way out.
        await this.changes.entityRemoved(entity);
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
        await Promise.all(
            entities.map(async (entity) => {
                if (entity instanceof Player) return;

                const dirty = entity.attributes.getDirty();
                if (dirty.length === 0) return;

                entity.attributes.clearDirty();
                await this.changes.entityAttributesChanged(entity, dirty);
            })
        );
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
     * @param {Entity} entity - The entity that moved.
     */
    public async broadcastMove(entity: Entity): Promise<void> {
        this.markEntityChunkChanged(entity);
        this.changes.entityMoved(entity);
    }

    private markEntityChunkChanged(entity: Entity): void {
        if (entity instanceof Player) return;

        const runtimeId = entity.getRuntimeId();
        const position = entity.getPosition();
        const nextChunkIndex = Chunk.packXZ(Math.floor(position.getX() / 16), Math.floor(position.getZ() / 16));
        const previousChunkIndex = this.entityChunkIndices.get(runtimeId);

        if (previousChunkIndex !== undefined && previousChunkIndex !== nextChunkIndex) {
            this.chunks.get(previousChunkIndex)?.markChanged();
        }
        this.chunks.get(nextChunkIndex)?.markChanged();
        this.entityChunkIndices.set(runtimeId, nextChunkIndex);
    }

    private markEntitiesInChunkChanged(chunk: Chunk): void {
        for (const entity of this.entities.values()) {
            if (entity instanceof Player) continue;

            const position = entity.getPosition();
            if (
                Math.floor(position.getX() / 16) === chunk.getX() &&
                Math.floor(position.getZ() / 16) === chunk.getZ()
            ) {
                chunk.markChanged();
            }
        }
    }

    /** Sends every player the movement that happened this tick, as one batch each. */
    private async flushMovement(): Promise<void> {
        await this.changes.flushMovement();
    }

    /**
     * The data-driven entities of this world's dimension, or undefined when it has none.
     *
     * Undefined while `content-packs` is off, which is what keeps the written entity classes
     * and {@link MobSpawner} in charge. With it on, this is what drives every mob's behavior:
     * its components, its goals, its brain, the spawn cycle and the despawn pass.
     * @returns {LiveEntityRuntime | undefined} The runtime, or undefined on the legacy path.
     */
    public dataEntities(): LiveEntityRuntime | undefined {
        return this.server.getEntityRuntime(this.dimension.name);
    }

    /**
     * Get all entities in this world.
     * @returns {Entity[]} the entities.
     */
    public getEntities(): Entity[] {
        return Array.from(this.entities.values());
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
        return this.entities.get(runtimeId) ?? null;
    }

    /**
     * Where everything is, as of the top of this tick.
     * @returns {EntityGrid} The grid, for asking what is near a point.
     */
    public getEntityGrid(): EntityGrid {
        return this.entityGrid;
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
     */
    public async saveChunks(): Promise<void> {
        const timer = new Timer();
        this.server.getLogger().info(`Saving chunks for level ${this.getFormattedName()}`);

        const changed = Array.from(this.chunks.values()).filter((chunk) => chunk.getHasChanged());
        for (let i = 0; i < changed.length; i += SAVE_BATCH_SIZE) {
            for (const chunk of changed.slice(i, i + SAVE_BATCH_SIZE)) await this.provider.writeChunk(chunk);

            if (i + SAVE_BATCH_SIZE < changed.length) await new Promise((resolve) => setImmediate(resolve));
        }

        this.server.getLogger().verbose(`(took §e${timer.stop()} ms§r)!`);
    }

    public async save(): Promise<void> {
        // `forEach` discards the promise an async callback returns, so these writes used to
        // be in flight - and their failures unobserved - long after `save` had resolved.
        // A shutdown save could return before a single player had reached disk.
        await Promise.all(this.getPlayers().map(async (player) => this.savePlayerData(player)));
        await this.saveChunks();
        await this.saveLevelData();
    }

    public getGameRuleManager(): GameRuleManager {
        return this.gameRuleManager;
    }

    public getTicks(): number {
        return this.currentTick;
    }

    public setTicks(tick: number): void {
        this.currentTick = tick;
    }

    public getProvider(): any {
        return this.provider;
    }

    // This is used for example in start game packet
    public getUUID(): string {
        return this.uuid;
    }

    public getName(): string {
        return this.name;
    }
    public getFormattedName(): string {
        return `§b'${this.name}'/${this.generator.constructor.name}§r`;
    }

    public getSeed(): number {
        return this.seed;
    }

    /**
     * Which dimension this world is, and therefore how tall it is and where its floor sits.
     *
     * Only the Overworld is reachable today - the Nether and the End need portals and their own
     * generators - but the chunk stack and the disk format both need the answer, and hardcoding it
     * in two places is how they end up disagreeing.
     */
    public getDimension(): DimensionDefinition {
        return this.dimension;
    }

    private async getLevelData(): Promise<Partial<LevelData>> {
        const path = withCwd(WORLDS_FOLDER_NAME, this.name, LEVEL_DATA_FILE_NAME);
        if (!fs.existsSync(path)) return {};

        try {
            // Parsed JSON is a boundary the compiler cannot see; the file is trusted as written.
            const data: unknown = (await readJsonFile(path, '{}')).get([]);
            return data as Partial<LevelData>;
        } catch (error: unknown) {
            // Something went wrong while reading or parsing the level data.
            this.server.getLogger().error(error);
        }

        return {};
    }
    /**
     * Writes `level.json` and whatever level metadata the provider keeps of its own.
     *
     * The spawn point written is the one the world already knows. Resolving it is a search
     * for dry land, and that generates terrain - which this used to do from inside the
     * autosave's tick, and from the middle of a shutdown where it reached a provider that had
     * already closed. {@link World.enable} resolves it once instead, so there is one to write
     * by the time anything saves.
     *
     * A world whose spawn is still unknown writes everything else and leaves the stored spawn
     * where it is. Overwriting a real spawn point with a guess would be worse than the gap.
     */
    public async saveLevelData(): Promise<void> {
        const spawn = this.getKnownSpawnPosition();
        if (!spawn) {
            this.server
                .getLogger()
                .debug(`No spawn point to save for ${this.getFormattedName()}`, 'World/saveLevelData');
        }

        const data = {
            ...(spawn ? { spawn: { x: spawn.getX(), y: spawn.getY(), z: spawn.getZ() } } : {}),
            gameRules: Array.from(this.getGameRuleManager().getGameRules()),
            entities: this.getEntities()
                .filter((entity) => !(entity instanceof Player))
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
        };

        try {
            // Written key by key, so a comment somebody left in the file stays with its key.
            const file = withCwd(WORLDS_FOLDER_NAME, this.name, LEVEL_DATA_FILE_NAME);
            const document = await readJsonFile(file, '{}');
            for (const [key, value] of Object.entries(data)) document.set([key], value);
            await writeJsonFile(file, document);
        } catch (error: unknown) {
            this.server.getLogger().error(`Failed to save level data`);
            this.server.getLogger().error(error);
        }

        if (!spawn) return;

        try {
            this.provider.saveLevelData({ x: spawn.getX(), y: spawn.getY(), z: spawn.getZ() });
        } catch (error: unknown) {
            this.server.getLogger().error(`Failed to save provider level data`);
            this.server.getLogger().error(error);
        }
    }

    /**
     * Get the player data for a player.
     * @param {Player} player - The player to get the data for.
     * @returns {Promise<WorldPlayerData>} The player data.
     */
    public async getPlayerData(player: Player): Promise<Partial<WorldPlayerData>> {
        const key = World.playerDataKey(player);

        try {
            const data = await this.provider.readPlayerData?.(key);
            if (data) return data;
        } catch (error: unknown) {
            this.server.getLogger().error(`Failed to read player data for ${key}`);
            this.server.getLogger().error(error);
        }

        try {
            const file = withCwd(WORLDS_FOLDER_NAME, this.name, 'playerdata', `${key}.json`);
            await fs.promises.access(file);
            // Parsed JSON is a boundary the compiler cannot see; the file is trusted as written.
            const data: unknown = (await readJsonFile(file, '{}')).get([]);
            return data as Partial<WorldPlayerData>;
        } catch (error: unknown) {
            // Missing player data is the ordinary case - it is what a first join looks like -
            // so this is a debug line and not an error. It used to raise "Player has no XUID"
            // for anybody unauthenticated and log that as a failure on every single join,
            // which is a thing `LoginHandler` explicitly permits and `savePlayerData` has
            // always written a file for.
            this.server
                .getLogger()
                .debug(
                    `PlayerData is missing for player ${key}: ${error instanceof Error ? error.message : String(error)}`
                );

            // No position: a player who has never been here is placed by `placePlayerSpawn`,
            // which needs to know that rather than be handed the raw spawn point.
            return { gamemode: this.server.getConfig().getGamemode() };
        }
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

    public async savePlayerData(player: Player): Promise<void> {
        // A shutdown kicks everyone, and each client's connection closes some time after the
        // world has already saved and closed its provider - so this arrives once more, per
        // player, with nothing left to write to. The shutdown's own `save` wrote them while
        // they were still online, so there is nothing lost in declining.
        if (this.closed) {
            this.server
                .getLogger()
                .debug(`${player.getName()} left after ${this.getFormattedName()} closed`, 'World/savePlayerData');
            return;
        }

        const data = {
            // Serialised explicitly: the uuid is a parsed object now, and letting JSON have
            // its way with it would write out the four raw parts instead of the identity.
            uuid: player.getUUID().toString(),
            username: player.getName(),
            gamemode: getGametypeName(player.gamemode),
            position: {
                x: player.getPosition().getX(),
                y: player.getPosition().getY(),
                z: player.getPosition().getZ(),
                pitch: player.pitch,
                yaw: player.yaw,
                headYaw: player.headYaw
            },
            advancements: storedAdvancements(player),
            enchantmentSeed: enchantmentSeedOf(player),
            inventory: storedInventory(player.getInventory()),
            health: player.getHealth(),
            food: player.getFood(),
            saturation: player.getSaturation(),
            experience: {
                level: player.attributes.getValue(AttributeIds.PlayerLevel),
                progress: player.attributes.getValue(AttributeIds.PlayerExperience)
            }
        } satisfies WorldPlayerData;

        try {
            const key = World.playerDataKey(player);
            if (this.provider.writePlayerData) {
                await this.provider.writePlayerData(key, data);
                return;
            }

            const file = withCwd(WORLDS_FOLDER_NAME, this.name, 'playerdata', `${key}.json`);
            const document = await readJsonFile(file, '{}');
            for (const [key, value] of Object.entries(data)) document.set([key], value);
            await writeJsonFile(file, document);
        } catch (error: unknown) {
            this.server.getLogger().error(`Failed to save player data`);
            this.server.getLogger().error(error);
        }
    }

    /**
     * @returns {Server} The server instance.
     */
    public getServer(): Server {
        return this.server;
    }
}
