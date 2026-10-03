import GameRuleManager, { GameRules } from './GameRuleManager';

import fs from 'node:fs';

import { parseJSON5 } from 'confbox';

import { Vector3 } from '@jsprismarine/math';
import { Gametype, getGametypeName, LevelEvent, LevelSoundEvent } from '@jsprismarine/minecraft';
import type { Block, Server, Service } from '../';
import Timer from '../utils/Timer';
import UUID from '../utils/UUID';
// Imported straight from its module rather than through the barrel: `index.ts` exports
// `./world/` before `Player`, so reaching for it via '../' lands back in a module that is
// still initialising and the binding is not a constructor yet when `instanceof` runs.
import Player from '../Player';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import type { BlockState } from '../block/state/BlockState';
import * as Entities from '../entity/Entities';
import type { Entity, SpawnableEntityClass } from '../entity/Entity';
import { Mob } from '../entity/Mob';
import ContainerEntry from '../inventory/ContainerEntry';
import { Item } from '../item/Item';
import type { ActorEvent } from '../network/packet/ActorEventPacket';
import BlockUpdateScheduler from './BlockUpdateScheduler';
import CoordinateUtils from './CoordinateUtils';
import EntityGrid from './EntityGrid';
import type { WorldChangeSink } from './WorldChangeSink';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';
import { Dimensions } from './Dimension';
import MobSpawner from './MobSpawner';
import BlockPhysics from './physics/BlockPhysics';
import type { DimensionDefinition } from './Dimension';
import { Position } from './Position';
import Progress from '../utils/Progress';
import { withCwd } from '../utils/cwd';
import type { Generator } from './Generator';
import Chunk from './chunk/Chunk';
import type BaseProvider from './providers/BaseProvider';

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
    config?: any;
    /** Defaults to the Overworld, which is the only one the server generates today. */
    dimension?: DimensionDefinition;
}

export interface LevelData {
    spawn: { x: number; y: number; z: number } | undefined;
    gameRules: Array<[string, any]>;
    entities: Array<{
        type: string;
        position: {
            x: number;
            y: number;
            z: number;
        };
    }>;
}
export interface WorldPlayerData {
    gamemode: string;
    position: {
        x: number;
        y: number;
        z: number;
        pitch: number;
        yaw: number;
        headYaw: number;
    };
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

    /** Where everything is, bucketed once a tick so mobs can ask who they are touching. */
    private readonly entityGrid = new EntityGrid();

    /**
     * The subset of `entities` that are player-controlled, kept alongside it.
     *
     * `getPlayers()` is called on essentially every broadcast, and deriving it meant walking
     * every entity in the world each time. Holding the players separately makes that a read.
     */
    private readonly players: Map<bigint, Player> = new Map();
    private readonly chunks: Map<bigint, Chunk> = new Map();
    private readonly gameRuleManager: GameRuleManager;
    private currentTick = 0;

    /** Two minutes at the server's twenty ticks per second. */
    private static readonly AUTO_SAVE_INTERVAL_TICKS = 20 * 120;
    private readonly provider: BaseProvider;
    private readonly server: Server;
    private readonly seed: number;
    private readonly generator: Generator;
    private readonly config: Object;
    private readonly dimension: DimensionDefinition;
    private spawn: Vector3 | null = null;

    /** Puts wildlife into the world near players and takes it away behind them. */
    private readonly mobSpawner: MobSpawner;

    /** Positions waiting to react to a nearby change, and what they do about it. */
    private readonly blockUpdates = new BlockUpdateScheduler();
    private readonly physics: BlockPhysics;

    /**
     * Where this world reports what happened in it.
     *
     * Dropped on the floor until something attaches a real one, which is what makes a world
     * runnable with no network layer at all - see {@link WorldChangeSink}.
     */
    private changes: WorldChangeSink = NULL_WORLD_CHANGE_SINK;

    public constructor({ name, server, provider, seed, generator, config, dimension }: WorldData) {
        this.name = name;
        this.server = server;
        this.provider = provider;
        this.gameRuleManager = new GameRuleManager(server);
        this.seed = seed;
        this.generator = generator;
        this.config = config ?? {};
        this.dimension = dimension ?? Dimensions.Overworld;
        this.mobSpawner = new MobSpawner(this);
        this.physics = new BlockPhysics(this);

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
                const Entity = Array.from(Object.values(Entities)).find((e) => e.MOB_ID === entityData.type) as
                    SpawnableEntityClass | undefined;
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

        await this.preloadSpawnRegion();
    }

    /**
     * On disable hook.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        await this.save();
        await this.provider.disable();
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

        const entities = this.getEntities();

        // Also before them, and for the same reason: every mob asks who it is touching, and it has
        // to be answered from where everything was at the top of the tick. Rebuilding it inside
        // the loop would let a mob be pushed by a neighbour that had already moved and not by one
        // that had not, which makes the shove depend on map iteration order.
        this.entityGrid.rebuild(entities);

        await Promise.all(entities.map((entity) => entity.update(tick)));

        // Straight after the updates that changed them, and before the spawner can add anything
        // whose attributes have not been touched yet.
        await this.flushEntityAttributes(entities);

        await this.mobSpawner.tick(tick);

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

    public async getBlock(x: number, y: number, z: number, layer = 0): Promise<Block> {
        const state = (await this.getChunkAt(x, z)).getBlock(x, y, z, layer);

        try {
            return this.server.getBlockManager().getBlock(state.name);
        } catch {
            // The chunk holds a block nobody registered a behaviour for; it still exists as
            // a state, but there is no Block to hand back.
            return this.server.getBlockManager().getBlock('minecraft:air');
        }
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
     * @param {number} cx - Chunk x.
     * @param {number} cz - Chunk z.
     * @returns {Chunk | null} The loaded chunk, or null - never a generated one.
     */
    public getLoadedChunk(cx: number, cz: number): Chunk | null {
        return this.chunks.get(Chunk.packXZ(cx, cz)) ?? null;
    }

    /** How many chunks are in memory, which is what the mob spawner budgets against. */
    public getLoadedChunkCount(): number {
        return this.chunks.size;
    }

    /**
     * Generates the chunks around spawn before the world opens for business.
     *
     * Centred on spawn, because the point is to have ready what the first player will
     * actually see - the previous version walked a square from chunk (0,0) outwards, which
     * for a spawn anywhere else was mostly work nobody would ever look at.
     *
     * Loading happens in batches with a yield between them. Chunk generation is synchronous,
     * so without that the event loop would be blocked for the whole preload: no progress
     * could be drawn, and the RakNet socket would not answer a single packet meanwhile.
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

        for (let i = 0; i < coordinates.length; i += PRELOAD_BATCH_SIZE) {
            const batch = coordinates.slice(i, i + PRELOAD_BATCH_SIZE);
            await Promise.all(batch.map(async ([x, z]) => this.loadChunk(x, z, true)));

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
     */
    public async loadChunk(x: number, z: number, _ignoreWarn?: boolean): Promise<Chunk> {
        const index = Chunk.packXZ(x, z);
        // Try - catch for provider errors
        const chunk = await this.provider.readChunk(x, z, this.seed, this.generator, this.config);
        this.chunks.set(index, chunk);

        await this.createGeneratedEntities(chunk);

        // TODO: event here, eg onChunkLoad
        return chunk;
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
            const Entity = Object.values(Entities).find((candidate) => candidate.MOB_ID === spawn.type) as
                SpawnableEntityClass | undefined;
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
     * Returns the world default spawn position.
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
     * may generate a chunk and terrain does not change meaningfully between neighbours.
     */
    private async findSurfaceSpawn(): Promise<Vector3> {
        for (let radius = 0; radius <= SPAWN_SEARCH_RADIUS; radius += SPAWN_SEARCH_STEP) {
            for (const [x, z] of World.ringAround(radius, SPAWN_SEARCH_STEP)) {
                const chunk = await this.getChunkAt(x, z);
                const y = chunk.getHighestBlockAt(x, z);
                if (y === null) continue;

                const surface = chunk.getBlock(x & 0xf, y, z & 0xf).name;
                if (UNSUITABLE_SPAWN_SURFACES.has(surface)) continue;

                return new Vector3(x, y + 1, z);
            }
        }

        // Nowhere suitable within the search: better to start above the origin than to
        // refuse to start at all.
        this.server.getLogger().warn(`No dry spawn found for ${this.getFormattedName()}, falling back to the origin`);
        return new Vector3(0, 100, 0);
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
        // A name the block registry does not know still places nothing: the state catalogue
        // has all 1219 blocks, but only the 260 with a class of their own can be given
        // behaviour, and the creative menu now offers every one of the 1919 items.
        const block =
            itemInHand instanceof Item ? this.server.getBlockManager().getBlock(itemInHand.getName()) : itemInHand;
        const clickedState = (await this.getChunkAt(blockPosition)).getBlock(blockPosition);
        const clickedBlock = this.server.getBlockManager().getBlock(clickedState.name);

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
                await player.sendMessage((error as any)?.message);

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
            // send it, and turning that on is a behaviour change rather than a move.
            return;
        }

        const runtimeId = BlockRuntimeIds.getByName(block.getStateName());

        // To the players who can see the block. This went through the session manager, so a
        // block placed here was announced to every player on the server - including those in
        // other worlds entirely.
        this.changes.blockChanged(placedPosition, runtimeId);

        this.changes.blockSound(placedPosition, LevelSoundEvent.PLACE, runtimeId);
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
        // registered a behaviour for costs the drops rather than the whole break.
        const broken = await this.getBlock(x, y, z);

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
            await this.dropContents(new Vector3(x + 0.5, y + 0.5, z + 0.5), broken.getDrops(itemInHand, this.server));
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
     * @param {number} [delay=1] - Ticks before the neighbours are looked at.
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
        if (y < chunk.getMinY() || y > chunk.getMaxY()) return false;

        // Idempotent, which matters more than it looks: physics re-examines positions constantly,
        // and a write that changed nothing would still cost a packet to every player and another
        // round of neighbour updates - so a settled pool of water would never stop working.
        if (chunk.getBlockRuntimeId(x & 0xf, y, z & 0xf) === runtimeId) return false;

        chunk.setBlockRuntimeId(x & 0xf, y, z & 0xf, runtimeId);

        this.changes.blockChanged(new Vector3(x, y, z), runtimeId);

        this.blockUpdates.scheduleAround(x, y, z, now, delay);
        return true;
    }

    /**
     * The same, for a block in its default state.
     * @param {number} x - World x.
     * @param {number} y - World y.
     * @param {number} z - World z.
     * @param {string} name - The block's namespace id.
     * @param {number} [now] - The tick to schedule the resulting updates from.
     * @param {number} [delay=1] - Ticks before the neighbours are looked at.
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
        const entity = new Entities.Item({
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

        // Reported once the maps hold it, so that whoever works out who should see what is
        // looking at the world as it now is - the arrival included.
        await this.changes.entityAdded(entity);
    }

    /**
     * Removes an entity from the level.
     * @param {Entity} entity - The entity to remove.
     */
    public async removeEntity(entity: Entity): Promise<void> {
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
        this.changes.entityMoved(entity);
    }

    /** Sends every player the movement that happened this tick, as one batch each. */
    private async flushMovement(): Promise<void> {
        await this.changes.flushMovement();
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
     */
    public async saveChunks(): Promise<void> {
        const timer = new Timer();
        this.server.getLogger().info(`Saving chunks for level ${this.getFormattedName()}`);

        await Promise.all(
            Array.from(this.chunks.values())
                .filter((c) => c.getHasChanged())
                .map(async (chunk) => this.provider.writeChunk(chunk))
        );
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

    private async getLevelData() {
        const path = withCwd(WORLDS_FOLDER_NAME, this.name, LEVEL_DATA_FILE_NAME);
        if (!fs.existsSync(path)) return {};

        try {
            const raw = await fs.promises.readFile(path, 'utf-8');
            return parseJSON5(raw.toString()) as Partial<LevelData>;
        } catch (error: any) {
            // Something went wrong while reading or parsing the level data.
            this.server.getLogger().error(error);
        }

        return {};
    }
    public async saveLevelData(): Promise<void> {
        const data = {
            spawn: await this.getSpawnPosition(),
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
            await fs.promises.writeFile(
                // FIXME: This overwrites comments in the file.
                withCwd(WORLDS_FOLDER_NAME, this.name, LEVEL_DATA_FILE_NAME),
                JSON.stringify(data, null, 4)
            );
        } catch (error: unknown) {
            this.server.getLogger().error(`Failed to save level data`);
            this.server.getLogger().error(error);
        }
    }

    /**
     * Get the player data for a player.
     * @param {Player} player - The player to get the data for.
     * @returns {Promise<WorldPlayerData>} The player data.
     */
    public async getPlayerData(player: Player): Promise<Partial<WorldPlayerData>> {
        try {
            const raw = await fs.promises.readFile(
                withCwd(WORLDS_FOLDER_NAME, this.name, 'playerdata', `${World.playerDataKey(player)}.json`),
                { flag: 'r', encoding: 'utf-8' }
            );
            return parseJSON5(raw.toString()) as Partial<WorldPlayerData>;
        } catch (error: unknown) {
            // Missing player data is the ordinary case - it is what a first join looks like -
            // so this is a debug line and not an error. It used to raise "Player has no XUID"
            // for anybody unauthenticated and log that as a failure on every single join,
            // which is a thing `LoginHandler` explicitly permits and `savePlayerData` has
            // always written a file for.
            this.server
                .getLogger()
                .debug(
                    `PlayerData is missing for player ${World.playerDataKey(player)}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );

            const spawn = await this.getSpawnPosition();
            return {
                gamemode: this.server.getConfig().getGamemode(),
                position: {
                    x: spawn.getX(),
                    y: spawn.getY(),
                    z: spawn.getZ(),
                    pitch: 0,
                    yaw: 0,
                    headYaw: 0
                }
            };
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
            }
        } as WorldPlayerData;

        try {
            await fs.promises.writeFile(
                // FIXME: This overwrites comments in the file.
                withCwd(WORLDS_FOLDER_NAME, this.name, 'playerdata', `${World.playerDataKey(player)}.json`),
                JSON.stringify(data, null, 4),
                { flag: 'w+', encoding: 'utf-8', flush: true }
            );
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
