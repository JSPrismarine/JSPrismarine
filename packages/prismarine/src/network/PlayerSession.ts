import type { GenerationPriority } from '@jsprismarine/chunkgen';
import { Vector3 } from '@jsprismarine/math';
import { CraftingDataPacket, CreativeContentPacket, PlayerActionType, PositionMode } from '@jsprismarine/protocol';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import {
    BuildPlatform,
    CommandPermissionLevel,
    ContainerUiId,
    Dimension,
    Gametype,
    PlayerPermissionLevel
} from '@jsprismarine/minecraft';
import { advancementChangedDimension } from '../advancement/triggers';
import type Player from '../Player';
import type Server from '../Server';
import { commandPermissionOf } from '../command/CommandManager';
import { PLAYER_SOFT_ENUM } from '../command/jsprismarineCommands';
import { CommandEnum } from '@jsprismarine/protocol/wire/structures/CommandEnum';
import { commandDataOf } from '../command/availableCommands';
import type { Attribute, Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { Entity } from '../entity/Entity';
import type { LiveOffer, TradeContext, TradeResult } from '@jsprismarine/trading';
import UpdateTradePacket from '@jsprismarine/protocol/packet/UpdateTradePacket';
import { tradeOffersPayload } from './tradeOffers';
import type { StatusEffect, StatusEffectChange } from '../entity/StatusEffect';
import { bedrockMobEffectId } from '../entity/StatusEffect';
import type { Metadata } from '@jsprismarine/protocol/wire/structures/Metadata';
import type Human from '../entity/Human';
import { eyePositionAt } from '../entity/Human';
import type { Item as ItemEntity } from '../entity/other/Item';
import type ContainerEntry from '../inventory/ContainerEntry';
import { blockContainerOf } from '../inventory/blockContainers';
import { blockSlotName } from '../inventory/containerSlots';
import { WindowIds } from '../inventory/WindowIds';
import { WindowTypes } from '../inventory/WindowTypes';
import { Item } from '../item/Item';
import BlockPosition from '../world/BlockPosition';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import CoordinateUtils from '../world/CoordinateUtils';
import { effectiveViewDistance, toChunk } from '../world/Proximity';
import { dimensionByBedrockId, maxSubChunk, minSubChunk } from '../world/Dimension';
import Chunk from '../world/chunk/Chunk';
import type ClientConnection from './ClientConnection';
import { BossBar } from './BossBar';
import { EntityTracker } from './EntityTracker';
import { craftingRecipeCount, joinContentPayloads, limitCraftingData } from './contentPayloads';
import { sendCachedJoinPacket } from './joinPacketCache';
import { creativeContentFrom } from './payloadAdapters';
import { overworldSpawnOf, playerSpawnPositionPacket } from './spawnPosition';
import AddActorPacket from '@jsprismarine/protocol/packet/AddActorPacket';
import AddItemActorPacket from '@jsprismarine/protocol/packet/AddItemActorPacket';
import AddPlayerPacket from '@jsprismarine/protocol/packet/AddPlayerPacket';
import { SyncedProperties } from '@jsprismarine/protocol/wire/structures/SyncedProperties';
import AvailableCommandsPacket from '@jsprismarine/protocol/packet/AvailableCommandsPacket';
import ChangeDimensionPacket from '@jsprismarine/protocol/packet/ChangeDimensionPacket';
import ShowCreditsPacket, { CreditsState } from '@jsprismarine/protocol/packet/ShowCreditsPacket';
import ChunkRadiusUpdatedPacket from '@jsprismarine/protocol/packet/ChunkRadiusUpdatedPacket';
import ContainerOpenPacket from '@jsprismarine/protocol/packet/ContainerOpenPacket';
import ContainerSetDataPacket from '@jsprismarine/protocol/packet/ContainerSetDataPacket';
import InventoryContentPacket from '@jsprismarine/protocol/packet/InventoryContentPacket';
import InventorySlotPacket from '@jsprismarine/protocol/packet/InventorySlotPacket';
import LevelChunkPacket from '@jsprismarine/protocol/packet/LevelChunkPacket';
import ClientCacheMissResponsePacket from '@jsprismarine/protocol/packet/ClientCacheMissResponsePacket';
import SubChunkPacket, { SubChunkRequestResult } from '@jsprismarine/protocol/packet/SubChunkPacket';
import type SubChunkRequestPacket from '@jsprismarine/protocol/packet/SubChunkRequestPacket';
import type { SubChunkEntry } from '@jsprismarine/protocol/packet/SubChunkPacket';
import SubChunkPos from '@jsprismarine/protocol/structure/SubChunkPos';
import SubChunkPosOffset from '@jsprismarine/protocol/structure/SubChunkPosOffset';
import SubChunkHeightmapData from '@jsprismarine/protocol/structure/SubChunkHeightmapData';
import type ClientCacheBlobStatusPacket from '@jsprismarine/protocol/packet/ClientCacheBlobStatusPacket';
import MobArmorEquipmentPacket from '@jsprismarine/protocol/packet/MobArmorEquipmentPacket';
import MobEquipmentPacket from '@jsprismarine/protocol/packet/MobEquipmentPacket';
import MobEffectPacket, { MobEffectEvent } from '@jsprismarine/protocol/packet/MobEffectPacket';
import MoveActorAbsolutePacket from '@jsprismarine/protocol/packet/MoveActorAbsolutePacket';
import MovePlayerPacket from '@jsprismarine/protocol/packet/MovePlayerPacket';
import type { ChunkCoord } from '@jsprismarine/protocol/packet/NetworkChunkPublisherUpdatePacket';
import NetworkChunkPublisherUpdatePacket from '@jsprismarine/protocol/packet/NetworkChunkPublisherUpdatePacket';
import { PlayStatus, PlayStatusPacket } from '@jsprismarine/protocol';
import PlayerActionPacket from '@jsprismarine/protocol/packet/PlayerActionPacket';
import PlayerListPacket from '@jsprismarine/protocol/packet/PlayerListPacket';
import { PlayerListAction, PlayerListEntry } from '@jsprismarine/protocol/wire/structures/PlayerListEntry';
import RemoveActorPacket from '@jsprismarine/protocol/packet/RemoveActorPacket';
import { PlayerRespawnState } from '@jsprismarine/minecraft';
import RespawnPacket from '@jsprismarine/protocol/packet/RespawnPacket';
import ActorEventPacket, { ActorEvent } from '@jsprismarine/protocol/packet/ActorEventPacket';
import SetActorDataPacket from '@jsprismarine/protocol/packet/SetActorDataPacket';
import SetActorMotionPacket from '@jsprismarine/protocol/packet/SetActorMotionPacket';
import SetPlayerGameTypePacket from '@jsprismarine/protocol/packet/SetPlayerGameTypePacket';
import StopSoundPacket from '@jsprismarine/protocol/packet/StopSoundPacket';
import { SetHealthPacket, SetTimePacket } from '@jsprismarine/protocol';
import type { GameRule } from '@jsprismarine/protocol/wire/structures/GameRule';
import GameRulesChangedPacket from '@jsprismarine/protocol/packet/GameRulesChangedPacket';
import UpdatePlayerGameTypePacket from '@jsprismarine/protocol/packet/UpdatePlayerGameTypePacket';
import TextPacket from '@jsprismarine/protocol/packet/TextPacket';
import UpdateAbilitiesPacket, {
    AbilityLayer,
    AbilityLayerFlag,
    AbilityLayerType
} from '@jsprismarine/protocol/packet/UpdateAbilitiesPacket';
import UpdateAdventureSettingsPacket from '@jsprismarine/protocol/packet/UpdateAdventureSettingsPacket';
import UpdateAttributesPacket from '@jsprismarine/protocol/packet/UpdateAttributesPacket';
import ChunkSender from './ChunkSender';
import ChunkBatchCache from './ChunkBatchCache';
import { ClientBlobCache } from './ClientBlobCache';
import type { CachedChunkDelivery } from '../world/ChunkScheduler';
import { TextPacketType } from '@jsprismarine/protocol';

/**
 * Chunks queued before a flush, and the reason this group is small.
 *
 * Each chunk is compressed as its own batch so identical chunk revisions can share the same
 * bytes across players. Keeping only a few queued together bounds per-player memory and lets
 * a flush dispatch the chunks promptly instead of waiting for a large region.
 *
 * Four queued chunks still fit comfortably inside the tick's generation throughput.
 */
const CHUNKS_PER_FLUSH = 4;
const MAX_QUEUED_CHUNK_BYTES = 8 * 1024 * 1024;
const chunkBatchCache = new ChunkBatchCache();

interface QueuedChunk {
    readonly chunk: Chunk;
    readonly payload: Buffer;
    readonly revision: number;
    /** Bytes retained by this queued request-mode packet. */
    readonly memoryBytes: number;
}

/**
 * How close a chunk has to be for a player to be counted as waiting on it.
 *
 * Two rings out: the chunk they stand in, the eight around it and the sixteen around those.
 * That is what a player walking at full speed reaches inside a second, and what they are
 * looking at when the terrain in front of them has not arrived.
 */
const URGENT_CHUNK_DISTANCE = 2;

/**
 * Where a player lands when {@link PlayerSession.changeWorld} moves them.
 *
 * The position is the feet position in `world`, as a portal's exit, the End platform, a spawn
 * block and `/tp` all produce it. A player's own position is their eyes (see
 * {@link import('../entity/Human').EYE_HEIGHT}), so `changeWorld` raises the arrival once, and
 * `ChangeDimensionPacket` and the `MovePlayer` teleport at the end of the change both carry
 * those eyes.
 */
export interface Arrival {
    /** The world the player arrives in. */
    world: World;
    /** Feet position in `world`, never the eyes. */
    position: Vector3;
    yaw: number;
    pitch: number;
    /** Whether the change follows a death rather than a portal or a teleport. Defaults to false. */
    respawn?: boolean;
    /**
     * Whether the client closes a loading screen for this change, which the change then stays
     * pending on. Defaults to true; a respawn after a death is the one the client does not.
     */
    closesLoadingScreen?: boolean;
}

/** A dimension change the client has not yet closed the loading screen for. */
export interface PendingDimensionChange {
    /** The `Loading Screen Id` the client has to report `EndLoadingScreen` with. */
    loadingScreenId: number;
    arrival: Arrival;
}

/**
 * Ticks a client has to close the loading screen of a dimension change before the server
 * finishes the change for it: a minute, well past the slowest world build.
 *
 * A client that never reports `EndLoadingScreen` would otherwise keep every later change held
 * and its own input dropped for as long as it stayed connected.
 */
const LOADING_SCREEN_TIMEOUT_TICKS = 1200;

/**
 * The longest a dimension change holds its first columns back waiting for the client to open the
 * change's loading screen: two seconds. A client that never reports it, such as one whose player
 * is dead and so shows no screen, gets its columns after this instead of not at all.
 */
const ARRIVAL_HOLD_TICKS = 40;

/** The block position a `PlayerActionPacket` carries when the action has no block. */
const NO_BLOCK = { x: 0, y: 0, z: 0 };

/** Screens whose primary content packet spans several named request containers. */
const COMBINED_BLOCK_CONTENT_SCREENS = new Set([
    WindowTypes.FURNACE,
    WindowTypes.BLAST_FURNACE,
    WindowTypes.SMOKER,
    WindowTypes.BREWING_STAND
]);

/** A screen a block opened for one player, as the session remembers it. */
export interface OpenBlockContainer {
    /** The `Container Id` it was opened under. */
    readonly windowId: number;
    /** The block it belongs to, which is what an enchanting table needs to count bookshelves. */
    readonly position: Vector3;
    /** The block standing there when it was opened. */
    readonly identifier: string;
    /** The `Container Type` the client is drawing. */
    readonly screen: WindowTypes;
    /**
     * The workstation's own input slots, in the order that station's recipe declares them.
     *
     * They live on the window rather than on the block because they are the player's: closing
     * the screen is what gives them back, and a second player at the same table has their own
     * inputs.
     */
    readonly inputs: (Item | null)[];
    /**
     * Bookshelves around an enchanting table, as the last redraw counted them.
     *
     * Kept rather than recounted when a row is taken, so the rows the player was shown and the
     * row that is applied are drawn from one number. Zero for every other screen.
     */
    bookshelfPower: number;
    /** Set when the window is a villager's trade screen rather than a block's container. */
    readonly trade?: OpenTrade;
}

/** What a trade screen needs from the trader it is open on. */
export interface TradeSource {
    /** The offers with the prices the player pays now. */
    offers(context?: TradeContext): readonly LiveOffer[];
    /** Runs one trade; see {@link Merchant.trade}. */
    trade(index: number, context?: TradeContext): TradeResult;
    /** The experience each level asks for. */
    tierRequirements(): readonly number[];
    /** The trader's level, from one. */
    readonly level: number;
}

/** A trade screen's trader, and what happens when the player stops trading. */
export interface OpenTrade {
    readonly trader: Entity;
    /** The title of the screen as a translation key, such as `entity.villager.farmer`; the trader's name when absent. */
    readonly title?: string;
    readonly source: TradeSource;
    /** The player's own state the discounts read, such as Hero of the Village. */
    context(): TradeContext;
    /** Called once when the screen closes, so the trader is free to trade with someone else. */
    release(): void;
    /** Called after each trade that went through, for what the villager does about it. */
    traded?(result: TradeResult): void;
}

/**
 * The first protocol whose clients are sent chunks in request mode, a skeleton and then the sub
 * chunks they ask for.
 *
 * A 2225 client completes its join that way. A 2193 client does not: it requests the sub chunks
 * and then never closes its loading screen, in any world tall enough to have more than one, so
 * it is sent whole chunks instead. Both measured with the e2e client built for each protocol.
 */
const SUB_CHUNK_REQUESTS_SINCE = 2225;

export default class PlayerSession {
    private connection: ClientConnection;
    private readonly server: Server;
    private player: Player;

    /**
     * Entity movement produced by this tick, waiting to go out as one batch.
     *
     * Keyed by runtime id rather than a list, so one entity contributes one packet however
     * many times it moved within the tick - see {@link PlayerSession.queueMoveActor}.
     */
    private readonly queuedMoves: Map<number, MoveActorAbsolutePacket> = new Map();

    private readonly chunkSendQueue: QueuedChunk[] = [];
    private queuedChunkBytes = 0;
    private readonly queuedChunkBytesLimit = MAX_QUEUED_CHUNK_BYTES;
    private readonly chunkQueueCapacityWaiters = new Set<() => void>();
    private readonly clientBlobCache = new ClientBlobCache();
    private clientCacheEnabled = false;

    /** Serializes sends when several generated chunks complete at the same time. */
    private chunkBatchFlush: Promise<void> = Promise.resolve();

    /** What this player still has to receive, nearest first. Drained by the server's scheduler. */
    private readonly chunkSender = new ChunkSender();
    private readonly loadedChunks = new Map<number, { readonly x: number; readonly z: number }>();
    private readonly loadingChunks = new Map<number, { readonly x: number; readonly z: number }>();

    /**
     * Which entities this client currently has on screen.
     *
     * Kept here, beside the chunk state, because it has exactly the same life: it is despawned
     * and emptied when the player changes world and it dies with the session, so nothing has
     * to remember to tidy it up.
     */
    private readonly entityTracker: EntityTracker;

    /** Set while a visibility pass runs, so two cannot overlap and spawn the same entity twice. */
    private reconciling = false;

    /**
     * Whether the spawn chunks and the PlayerSpawn status have gone out yet.
     *
     * They wait for the client's first `RequestChunkRadius`: see {@link PlayerSession.setViewDistance}.
     */
    private spawnChunksSent = false;

    /** Set while the spawn chunks are still draining - see {@link PlayerSession.announceSpawnIfReady}. */
    private spawnChunksPending = false;

    /** Where a respawn change is waiting to tell the client it comes back: see {@link PlayerSession.answerRespawnIfReady}. */
    private pendingRespawnAnswer: Vector3 | undefined;

    /**
     * The chunk the player was in when anything last checked.
     *
     * Crossing a boundary is what triggers both a chunk request and a visibility pass, and it
     * is also the early-out that stops `needNewChunks` rebuilding its heap twenty times a
     * second for a player standing still.
     */
    private lastChunkX: number | null = null;
    private lastChunkZ: number | null = null;

    /** The last window id handed out; see {@link PlayerSession.nextWindowId}. */
    private windowId = 0;

    /**
     * The container windows this session has opened on the client and not yet seen closed,
     * by window id, each holding the `Container Type` it was opened as.
     *
     * The server's side of what the docs call the container manager: a `ContainerClose` from
     * the client is checked against it, see {@link PlayerSession.closeWindow}.
     */
    private readonly openWindows = new Map<number, number>();

    /**
     * The block container this session has open, or undefined for none.
     *
     * One at a time, which is what the client allows: a player with a chest open who clicks a
     * furnace has closed the chest. Kept because a later `ItemStackRequest` names a container
     * by its `ContainerUiId` and not by the block it belongs to, so the block it belongs to has
     * to be remembered here.
     */
    private blockContainer: OpenBlockContainer | undefined;

    /**
     * The last value sent for each `ContainerSetData` property of the open block container.
     *
     * A cooking station ticks every tick and its counters move on most of them, so without
     * this a furnace would be three packets a tick per watcher. Cleared with the window, so a
     * player who opens one mid-cook is sent the whole state rather than the tail of it.
     */
    private readonly containerData = new Map<number, number>();

    /**
     * The tick of the last `PlayerAuthInputPacket` handled for this client, or `0n` before the
     * first one.
     *
     * Client-bound packets about the player carry a `PlayerInputTick`, and the docs want it to be
     * this value, not the server's tick counter. The client matches it against its own input
     * history to undo predictions it made while the packet was in flight. The server's counter
     * is not in that history, so it told the client nothing; zero is what the docs allow before
     * any input has arrived.
     */
    private lastInputTick = 0n;

    /**
     * The `Loading Screen Id` the next `ChangeDimensionPacket` gets. The docs ask for an
     * unsigned integer that increments for ever and is unique among the screens still open.
     */
    private nextLoadingScreenId = 1;

    /** Ids from {@link PlayerSession.beginLoadingScreen} whose end the client has not reported. */
    private readonly openLoadingScreens = new Set<number>();

    /**
     * The world change the client is still loading into, with the dimension name it left for
     * the advancement hook. See {@link PlayerSession.changeWorld}.
     */
    private pendingChange:
        | (PendingDimensionChange & {
              left: string;
              sinceTick: number;
              /** Whether the arrival columns may go out; see {@link PlayerSession.releaseArrivalChunks}. */
              arrivalReleased?: boolean;
          })
        | undefined;
    /** The move a caller asked for while {@link pendingChange} was open, run once it closes. */
    private queuedChange: Arrival | undefined;

    /**
     * The arrival held back while the end credits roll on the client, or undefined when no
     * credits are pending. See {@link PlayerSession.startCredits}.
     */
    private pendingCredits: Arrival | undefined;

    /**
     * Bumped by {@link PlayerSession.clearChunks}. A chunk batch compares the value it started
     * with against this once its send completes, so a batch that was on the wire while the
     * player changed world does not record the old world's coordinates as loaded in the new.
     */
    private chunkEpoch = 0;

    public constructor(server: Server, connection: ClientConnection, player: Player) {
        this.server = server;
        this.connection = connection;
        this.player = player;

        const config = this.server.getConfig();
        this.entityTracker = new EntityTracker({
            hysteresis: config.getEntityTrackingHysteresis(),
            enabled: config.getProximityBroadcast()
        });
    }

    /**
     * Puts this client into the server-wide rotation that feeds it chunks.
     *
     * Not done in the constructor: a session that is built and then thrown away - a join that
     * fails part way through - would stay in the scheduler's set for the life of the server,
     * because the scheduler only ever skips the disconnected and removes on request.
     * @group Lifecycle
     */
    public enable(): void {
        this.server.getChunkScheduler().add(this);
    }

    /**
     * Takes this client back out of the chunk rotation and off every boss bar. Paired with
     * {@link PlayerSession.enable} and safe to call more than once.
     * @group Lifecycle
     */
    public disable(): void {
        this.server.getChunkScheduler().remove(this);
        BossBar.releasePlayer(this.player);
    }

    /** The queue the scheduler drains - see {@link ChunkRecipient}. */
    public get sender(): ChunkSender {
        return this.chunkSender;
    }

    /**
     * Produces one chunk and queues it for the next batch. Called only by the scheduler.
     *
     * The scheduler takes a coordinate off the queue before calling this, so a failure here
     * has to put the bookkeeping back: `loadingChunks` is what stops `needNewChunks` from
     * asking for the same chunk twice, and leaving the hash in it after nothing was sent
     * means that chunk is never requested again - a permanent hole in the player's world for
     * as long as they stay in range of it.
     */
    public async deliver(x: number, z: number): Promise<void> {
        const epoch = this.chunkEpoch;
        try {
            await this.requestChunk(x, z);
            if (epoch !== this.chunkEpoch) return;
            if (this.chunkSendQueue.length >= CHUNKS_PER_FLUSH) await this.flushChunkBatch();
        } catch (error: unknown) {
            this.loadingChunks.delete(Chunk.packXZ(x, z));
            throw error;
        }
    }

    /** Queues a resident chunk without entering the generation and disk-read depth gate. */
    public tryDeliverLoaded(x: number, z: number): CachedChunkDelivery {
        const chunk = this.player.getWorld().getLoadedChunk(x, z);
        if (chunk === null) return { kind: 'not-loaded' };

        const queued = this.prepareQueuedChunk(chunk);
        const queuedBytes = queued.memoryBytes;
        if (!this.hasChunkQueueCapacity(queuedBytes)) return { kind: 'backpressure' };

        this.queueChunkNow(queued);
        return { kind: 'queued', queuedBytes };
    }

    /** Enables or clears client blob caching for subsequent subchunk requests. */
    public setClientCacheEnabled(enabled: boolean): void {
        this.clientCacheEnabled = enabled;
        if (!enabled) this.clientBlobCache.clear();
    }

    /** Whether this session will use cached blobs in request-mode subchunk responses. */
    public getClientCacheEnabled(): boolean {
        return this.clientCacheEnabled;
    }

    /** Responds to requested blob misses and applies the client's acknowledgements. */
    public async handleClientCacheBlobStatus(packet: ClientCacheBlobStatusPacket): Promise<number> {
        if (!this.clientCacheEnabled) return 0;

        const blobs = this.clientBlobCache.respond(packet.missingIds, packet.foundIds);
        if (blobs.length === 0) return 0;

        const response = new ClientCacheMissResponsePacket();
        response.blobs = blobs;
        await this.send(response);
        return blobs.length;
    }

    /**
     * Answers requested sections with their bytes, block entities, heightmaps, and cache ids.
     * @param packet - The requested chunk columns and absolute subchunk center.
     */
    public async handleSubChunkRequest(packet: SubChunkRequestPacket): Promise<number> {
        if (packet.offsets.length === 0) return 0;

        const online = this.isConnected();
        const world = online ? this.player.getWorld() : undefined;
        const dimension = world?.getDimension();
        const cacheEnabled = this.clientCacheEnabled;
        const entries: SubChunkEntry[] = [];
        for (const offset of packet.offsets) {
            const y = packet.centerPos.y + offset.y;
            const entry: SubChunkEntry = {
                offset: new SubChunkPosOffset(offset.x, offset.y, offset.z),
                result: SubChunkRequestResult.PLAYER_DOESNT_EXIST,
                heightMaps: new SubChunkHeightmapData()
            };

            if (!online || world === undefined || dimension === undefined) {
                entries.push(entry);
                continue;
            }
            if (packet.dimensionType !== dimension.bedrockId) {
                entry.result = SubChunkRequestResult.WRONG_DIMENSION;
                entries.push(entry);
                continue;
            }
            const clientRange = dimension.custom ? dimension : (dimensionByBedrockId(dimension.bedrockId) ?? dimension);
            if (y < minSubChunk(clientRange) || y > maxSubChunk(clientRange)) {
                entry.result = SubChunkRequestResult.INDEX_OUT_OF_BOUNDS;
                entries.push(entry);
                continue;
            }

            const x = packet.centerPos.x + offset.x;
            const z = packet.centerPos.z + offset.z;
            let chunk = world.getLoadedChunk(x, z);
            // A chunk this client was told about has to be answerable. The client asks for its
            // sub chunks only once, and a "doesn't exist" is final for that column, so one the
            // world evicted between the announcement and the request would stay a hole for as
            // long as the player stood there. Read it back instead; a chunk nobody announced is
            // not loaded on a client's say-so.
            const hash = Chunk.packXZ(x, z);
            if (chunk === null && this.loadedChunks.has(hash)) {
                chunk = await world.getChunk(x, z, { urgency: 'immediate' });
            }
            if (chunk === null || chunk.getX() !== x || chunk.getZ() !== z) {
                // Debug: a client that has moved or changed dimension asks for columns of its old
                // view, one line per sub chunk, and there is nothing for an operator to do about it.
                this.server
                    .getLogger()
                    .debug(
                        `${this.player.getName()} asked for sub chunk ${x}, ${y}, ${z}, which is not loaded`,
                        'PlayerSession/handleSubChunkRequest'
                    );
                entry.result = SubChunkRequestResult.LEVEL_CHUNK_DOESNT_EXIST;
                entries.push(entry);
                continue;
            }

            const blob = cacheEnabled ? this.clientBlobCache.prepareRequestSubChunk(chunk, y) : undefined;
            const data = blob?.data ?? chunk.networkSerializeRequestSubChunk(y);
            const allAir = data.byteLength === 2 && data[0] === 8 && data[1] === 0;
            entry.result = allAir ? SubChunkRequestResult.SUCCESS_ALL_AIR : SubChunkRequestResult.SUCCESS;
            entry.heightMaps = chunk.networkSubChunkHeightmaps(y);

            if (blob !== undefined) {
                this.clientBlobCache.track([blob]);
                Object.assign(entry, { blobId: blob.id });

                // The client can reuse a confirmed blob. An all-air section also carries only
                // its hash when caching is enabled; a miss is answered through the cache packet.
                if (allAir || this.clientBlobCache.hasClientBlob(blob.id)) {
                    entries.push(entry);
                    continue;
                }
            }

            Object.assign(entry, { serializedSubChunk: data });
            entries.push(entry);
        }

        const response = new SubChunkPacket({
            cacheEnabled,
            dimension: packet.dimensionType,
            centerPos: new SubChunkPos(packet.centerPos.x, packet.centerPos.y, packet.centerPos.z),
            entries
        });
        await this.send(response);
        return entries.length;
    }

    public isConnected(): boolean {
        return this.player.isOnline();
    }

    /** Queues the chunks around a position, nearest first, without sending anything yet. */
    public queueChunks(centerX: number, centerZ: number, coordinates: Array<[number, number]>): void {
        this.chunkSender.setCenter(centerX, centerZ);

        for (const [x, z] of coordinates) {
            const hash = Chunk.packXZ(x, z);
            if (this.loadedChunks.has(hash) || this.loadingChunks.has(hash)) continue;

            this.enqueueChunkCoordinate(hash, x, z);
        }
    }

    /**
     * Per-tick work for this client: terrain to request, entities to show or hide.
     *
     * Both hang off the same question - has the player walked into a different chunk. Asking
     * it here rather than inside each is what stops `needNewChunks` rebuilding a heap of a few
     * hundred candidates twenty times a second for a player who has not moved, and it is what
     * makes a moving player see entities appear within a tick rather than on the next interval.
     * @param {number} _tick - The current server tick.
     */
    public async update(tick: number): Promise<void> {
        const pending = this.pendingChange;
        if (pending !== undefined && tick - pending.sinceTick >= LOADING_SCREEN_TIMEOUT_TICKS) {
            this.server
                .getLogger()
                .warn(
                    `${this.player.getName()} never closed loading screen ${pending.loadingScreenId} of the change to ${pending.arrival.world.getName()}; finishing it for them`,
                    'PlayerSession/update'
                );
            this.endLoadingScreen(pending.loadingScreenId);
            await this.completeDimensionChange(pending.loadingScreenId);
        } else if (
            pending !== undefined &&
            pending.arrivalReleased !== true &&
            tick - pending.sinceTick >= ARRIVAL_HOLD_TICKS
        ) {
            this.server
                .getLogger()
                .debug(
                    `${this.player.getName()} has not opened loading screen ${pending.loadingScreenId}; sending its arrival columns anyway`,
                    'PlayerSession/update'
                );
            pending.arrivalReleased = true;
            await this.flush();
        }

        if (!this.player.viewDistance) return;

        const position = this.player.getPosition();
        const chunkX = toChunk(position.getX());
        const chunkZ = toChunk(position.getZ());

        if (chunkX === this.lastChunkX && chunkZ === this.lastChunkZ) return;

        this.lastChunkX = chunkX;
        this.lastChunkZ = chunkZ;

        await this.needNewChunks();
        await this.reconcileTrackedEntities();
    }

    /**
     * Whether this client knows about the entity.
     *
     * True for the player's own entity, which the tracker itself never holds - a client is
     * not sent a spawn for the thing it is driving, but it plainly *has* it. Without this the
     * gates built on `tracks` would drop a player's own hurt animation and the pickup
     * animation for the item they just walked over.
     * @param {bigint} runtimeId - The entity's runtime id.
     * @returns {boolean} `true` if the client can act on a packet naming that id.
     */
    public tracks(runtimeId: bigint): boolean {
        return runtimeId === this.player.getRuntimeId() || this.entityTracker.tracks(runtimeId);
    }

    /**
     * Shows and hides entities so the client matches where the player now is.
     *
     * Records an entity as tracked only *after* its spawn has gone out. Marking first would
     * mean a spawn that failed left the entity flagged as delivered, and nothing would ever
     * send it again - the same lesson `flushChunkBatch` records for chunks, where it left a
     * permanent hole in the world.
     * @param {Iterable<Entity>} [entities] - Every entity in the world, and it must be every
     * one - anything tracked and absent from it is taken to have left and is despawned.
     * Defaults to asking the world. For a single arrival, use {@link PlayerSession.considerEntity}.
     */
    public async reconcileTrackedEntities(entities?: Iterable<Entity>): Promise<void> {
        if (this.reconciling || !this.isConnected()) return;

        this.reconciling = true;
        try {
            const change = this.entityTracker.plan({
                viewer: this.player.getPosition(),
                viewDistance: this.player.viewDistance,
                self: this.player.getRuntimeId(),
                entities: entities ?? this.player.getWorld().getEntities()
            });

            for (const entity of change.spawn) {
                await entity.spawnTo(this);
                this.entityTracker.add(entity.getRuntimeId());
            }

            for (const runtimeId of change.despawn) {
                this.entityTracker.remove(runtimeId);
                await this.sendRemoveActorById(runtimeId);
            }
        } finally {
            this.reconciling = false;
        }
    }

    /**
     * Shows one entity to this client, if it is close enough and not already shown.
     *
     * The single-entity path, for something that has just entered the world rather than a
     * whole pass over everything in it.
     * @param {Entity} entity - The entity to consider.
     */
    public async considerEntity(entity: Entity): Promise<void> {
        if (!this.isConnected()) return;
        if (entity.getRuntimeId() === this.player.getRuntimeId()) return;
        if (!this.entityTracker.shouldSpawn(entity, this.player.getPosition(), this.player.viewDistance)) return;

        await entity.spawnTo(this);
        this.entityTracker.add(entity.getRuntimeId());
    }

    /**
     * Hides one entity from this client if it is showing, and forgets it either way.
     *
     * Unconditional forgetting matters: a stale id left behind would make the tracker believe
     * the client still has an entity it does not, and block it from ever being sent again.
     * @param {Entity} entity - The entity that is going away.
     */
    public async dropEntity(entity: Entity): Promise<void> {
        if (!this.entityTracker.remove(entity.getRuntimeId())) return;
        await this.sendRemoveActorById(entity.getRuntimeId());
    }

    /**
     * Hides every tracked entity from this client and forgets them all.
     *
     * For a world change. A dimension change does not make the client drop what it holds, so
     * the mobs of the world being left stayed on screen in the new one. Not routed through
     * {@link PlayerSession.reconcileTrackedEntities}: that returns early while another pass
     * runs, and a world change cannot be skipped.
     */
    public async despawnAllTrackedEntities(): Promise<void> {
        for (const runtimeId of this.entityTracker.clear()) {
            await this.sendRemoveActorById(runtimeId);
        }
    }

    /**
     * Sends what has been produced but not yet dispatched.
     *
     * Called by the scheduler at the end of its pass, so a partial batch does not sit until
     * the next tick.
     */
    public async flush(): Promise<void> {
        if (this.chunkSendQueue.length > 0) await this.flushChunkBatch();
    }

    /**
     * Serialises, compresses and dispatches the pending chunks.
     *
     * Deliberately called from within {@link deliver}, which the scheduler awaits inside its
     * time budget. Doing it here instead of once per tick elsewhere is what makes that
     * budget honest: serialising and compressing is the larger part of the cost, and while
     * it happened outside the measured window the scheduler was timing `deliver` - nearly
     * free for a cached chunk - and believing it had spent almost nothing.
     */
    private flushChunkBatch(): Promise<void> {
        const flush = this.chunkBatchFlush.then(() => this.flushQueuedChunks());
        this.chunkBatchFlush = flush.catch(() => {});
        return flush;
    }

    /** Sends one queued batch after any earlier batch has finished. */
    private async flushQueuedChunks(): Promise<void> {
        // Kept queued, not sent, until the client has opened the change's loading screen.
        if (this.holdsArrivalChunks()) return;
        const chunksToSend = this.chunkSendQueue.splice(0, this.chunkSendQueue.length);
        if (chunksToSend.length === 0) return;
        const epoch = this.chunkEpoch;
        const payloadBytes = chunksToSend.reduce((total, { memoryBytes }) => total + memoryBytes, 0);

        // The publisher update has to come first, and has to be current.
        //
        // It names the point around which chunks stay visible and how far that reaches; the
        // client ignores anything outside the radius of the most recent one, and shows
        // nothing at all if none was ever sent. Chunks now arrive spread over many ticks, so
        // a single update sent at join goes stale the moment the player walks - which is why
        // chunks stopped appearing, or appeared out of order. Vanilla servers send this
        // continuously at the player's position, and so does this.
        //
        // `saved_chunks` stays empty on purpose: the client takes that list as the set that
        // should be showing, so naming only the current batch un-rendered everything sent
        // before it. What governs visibility is the radius around the position.
        // https://github.com/PrismarineJS/minecraft-data/blob/master/data/bedrock/1.21.42/proto.yml
        const publisherSend = this.sendNetworkChunkPublisher(effectiveViewDistance(this.player.viewDistance), []);

        try {
            await publisherSend;
            const compressionLevel = this.server.getConfig().getPacketCompressionLevel();
            const requestMode = this.usesSubChunkRequests();
            for (const { chunk, payload, revision } of chunksToSend) {
                // A world change while an earlier chunk was compressing or sending: the rest are
                // the old world's, and the client has already been told it is somewhere else.
                if (epoch !== this.chunkEpoch) return;
                const batch = await chunkBatchCache.getOrCreate(
                    chunk,
                    revision,
                    this.connection.codec,
                    compressionLevel,
                    () => [
                        new LevelChunkPacket({
                            chunkX: chunk.getX(),
                            chunkZ: chunk.getZ(),
                            dimension: chunk.getDimension().bedrockId,
                            subChunkCount: requestMode
                                ? chunk.getNetworkSubChunkRequestLimit()
                                : chunk.getNetworkSubChunkCount(),
                            clientSubChunkRequestsEnabled: requestMode,
                            cached: false,
                            payload
                        })
                    ],
                    this.connection.compressionAlgorithm,
                    this.connection.compressionThreshold,
                    requestMode ? 'request-mode' : 'uncached'
                );
                if (epoch !== this.chunkEpoch) return;

                // Shared compression is safe; framing and encryption remain ordered per connection.
                await this.connection.sendSharedCompressedBatchAsync(
                    batch.content,
                    batch.packets,
                    false,
                    batch.packetBuffers
                );
            }

            // A world change happened while the batch was compressing. These were the old world's
            // chunks; the sets were cleared for the new one and the hashes must not come back.
            if (epoch !== this.chunkEpoch) return;

            // Loaded only once it is actually on the wire.
            for (const { chunk } of chunksToSend) {
                const hash = Chunk.packXZ(chunk.getX(), chunk.getZ());
                this.loadedChunks.set(hash, { x: chunk.getX(), z: chunk.getZ() });
                this.loadingChunks.delete(hash);
            }

            // The spawn status waits for this, not the other way round.
            await this.announceSpawnIfReady();
            await this.answerRespawnIfReady();
        } catch (error: unknown) {
            // Nothing is marked loaded unless every batch reached the ordered send path. If a
            // later chunk in this partial group fails, re-requesting earlier chunks is harmless.
            for (const { chunk } of chunksToSend) this.loadingChunks.delete(Chunk.packXZ(chunk.getX(), chunk.getZ()));
            throw error;
        } finally {
            this.releaseChunkQueueBytes(payloadBytes);
        }
    }

    /**
     * Sends one packet to this client.
     *
     * Returns the send rather than dropping it: without this, every `await session.send(...)`
     * and every `Promise.all` over a broadcast resolved immediately and any framing error
     * went nowhere.
     * @param packet - The packet to send.
     */
    public async send(packet: NetworkPacket<unknown>): Promise<void> {
        return this.connection.sendDataPacket(packet);
    }

    /**
     * Notify a client about change(s) to the adventure settings.
     *
     * @param player - The client-controlled entity
     */
    public async sendSettings(player?: Player): Promise<void> {
        const target = player ?? this.player;

        const spectator = target.gamemode === Gametype.SPECTATOR;
        const packet = new UpdateAdventureSettingsPacket({
            worldImmutable: spectator,
            noAttackingPlayers: spectator,
            noAttackingMobs: spectator,
            autoJump: true,
            showNameTags: true
        });
        await this.connection.sendDataPacket(packet);
    }

    /**
     * Sends `UpdateAbilitiesPacket` describing `player` to this client.
     *
     * One `BASE` layer carries every ability, derived from the game mode and op state, with
     * walk speed 0.1, fly speed 0.05 and vertical fly speed 1, the client's own defaults.
     * The target id is the player's runtime id, which the server also uses as its unique id.
     *
     * @param player - The player described. Defaults to this session's own player.
     */
    public async sendAbilities(player?: Player): Promise<void> {
        const target = player ?? this.player;

        // Read off the gamemode rather than each written out by hand, which is how
        // `INSTABUILD` - the flag that *is* creative, as far as the client is concerned - came
        // to be granted to spectators and withheld from creative players.
        const creative = target.gamemode === Gametype.CREATIVE;
        const spectator = target.gamemode === Gametype.SPECTATOR;

        // The base layer names every ability, so the client replaces its whole state rather
        // than keeping stale bits. The three speed flags mark their floats as applying; without
        // `VERTICAL_FLY_SPEED` the client ignored the vertical speed written below.
        const mainLayer = new AbilityLayer();
        mainLayer.layerType = AbilityLayerType.BASE;
        mainLayer.layerFlags = new Map([
            [AbilityLayerFlag.FLY_SPEED, true],
            [AbilityLayerFlag.WALK_SPEED, true],
            [AbilityLayerFlag.VERTICAL_FLY_SPEED, true],
            [AbilityLayerFlag.MAY_FLY, creative || spectator || target.metadata.canFly],
            [AbilityLayerFlag.FLYING, spectator || target.isFlying()],
            [AbilityLayerFlag.NO_CLIP, spectator],
            [AbilityLayerFlag.OPERATOR_COMMANDS, target.isOp()],
            [AbilityLayerFlag.TELEPORT, target.isOp()],
            [AbilityLayerFlag.INVULNERABLE, creative || spectator],
            [AbilityLayerFlag.MUTED, false],
            [AbilityLayerFlag.WORLD_BUILDER, false],
            [AbilityLayerFlag.INSTABUILD, creative],
            [AbilityLayerFlag.LIGHTNING, false],
            [AbilityLayerFlag.PRIVILEGED_BUILDER, false],
            [AbilityLayerFlag.BUILD, !spectator],
            [AbilityLayerFlag.MINE, !spectator],
            [AbilityLayerFlag.DOORS_AND_SWITCHES, !spectator],
            [AbilityLayerFlag.OPEN_CONTAINERS, !spectator],
            [AbilityLayerFlag.ATTACK_PLAYERS, !spectator],
            [AbilityLayerFlag.ATTACK_MOBS, !spectator]
        ]);
        mainLayer.flySpeed = 0.05;
        mainLayer.verticalFlySpeed = 1;
        mainLayer.walkSpeed = 0.1;

        const packet = new UpdateAbilitiesPacket();
        packet.commandPermission = target.isOp() ? CommandPermissionLevel.GAME_DIRECTORS : CommandPermissionLevel.ANY;
        packet.playerPermission = target.isOp() ? PlayerPermissionLevel.OPERATOR : PlayerPermissionLevel.MEMBER;
        packet.targetActorUniqueId = target.getRuntimeId();
        packet.abilityLayers = [mainLayer];
        await this.send(packet);
    }

    public async needNewChunks(forceResend = false, dist?: number): Promise<void> {
        const currentXChunk = CoordinateUtils.fromBlockToChunk(this.player.getPosition().getX());
        const currentZChunk = CoordinateUtils.fromBlockToChunk(this.player.getPosition().getZ());

        const viewDistance = this.player.viewDistance || dist || 0;

        this.chunkSender.setCenter(currentXChunk, currentZChunk);

        for (let sendXChunk = -viewDistance; sendXChunk <= viewDistance; sendXChunk++) {
            for (let sendZChunk = -viewDistance; sendZChunk <= viewDistance; sendZChunk++) {
                if (sendXChunk * sendXChunk + sendZChunk * sendZChunk > viewDistance * viewDistance) continue; // early exit if chunk is outside of view distance
                const x = currentXChunk + sendXChunk;
                const z = currentZChunk + sendZChunk;
                const hash = Chunk.packXZ(x, z);

                if (forceResend) {
                    this.loadedChunks.delete(hash);
                    if (!this.loadingChunks.has(hash)) this.enqueueChunkCoordinate(hash, x, z);
                } else if (!this.loadedChunks.has(hash) && !this.loadingChunks.has(hash)) {
                    this.enqueueChunkCoordinate(hash, x, z);
                }
            }
        }

        let unloaded = false;

        for (const [hash, { x, z }] of this.loadedChunks) {
            if (Math.abs(x! - currentXChunk) > viewDistance || Math.abs(z! - currentZChunk) > viewDistance) {
                unloaded = true;
                this.loadedChunks.delete(hash);
            }
        }

        for (const [hash, { x, z }] of this.loadingChunks) {
            if (Math.abs(x! - currentXChunk) > viewDistance || Math.abs(z! - currentZChunk) > viewDistance) {
                this.loadingChunks.delete(hash);

                // And out of the queue too, not only out of the bookkeeping.
                //
                // These two have to be forgotten together: dropping the hash alone left the
                // coordinate in the sender, so the scheduler went on to generate and send a
                // region the player had already walked out of - paid for at the expense of
                // the chunks in front of them. Worse, `loadingChunks` no longer knew about
                // it, so walking back in queued it a second time, and a player pacing about
                // could grow the queue without bound.
                this.chunkSender.forget(x!, z!);
            }
        }

        if (!unloaded && this.chunkSendQueue.length !== 0) {
            await this.sendNetworkChunkPublisher(dist ?? viewDistance, []);
        }
    }

    /** Records queued coordinates once; the sender owns the only nearest-first ordering pass. */
    private enqueueChunkCoordinate(hash: number, x: number, z: number): void {
        this.loadingChunks.set(hash, { x, z });
        this.chunkSender.enqueue(x, z);
    }

    public async requestChunk(x: number, z: number): Promise<void> {
        const epoch = this.chunkEpoch;
        const chunk = await this.player.getWorld().getChunk(x, z, { urgency: this.urgencyOf(x, z) });
        await this.queueChunk(chunk, epoch);
    }

    private async queueChunk(chunk: Chunk, epoch: number): Promise<void> {
        while (epoch === this.chunkEpoch) {
            const queued = this.prepareQueuedChunk(chunk);
            if (queued.memoryBytes > this.queuedChunkBytesLimit) {
                throw new RangeError(
                    `Chunk payload ${queued.memoryBytes} exceeds the ${this.queuedChunkBytesLimit}-byte queue limit`
                );
            }
            if (this.hasChunkQueueCapacity(queued.memoryBytes)) {
                this.queueChunkNow(queued);
                return;
            }

            // A capacity wait may last across a network send. Drop this temporary entry before yielding.
            if (this.chunkSendQueue.length > 0) {
                await this.flushChunkBatch();
            } else {
                await new Promise<void>((resolve) => this.chunkQueueCapacityWaiters.add(resolve));
            }
        }
    }

    private queueChunkNow(queued: QueuedChunk): void {
        this.chunkSendQueue.push(queued);
        this.queuedChunkBytes += queued.memoryBytes;
    }

    /** Whether this client is sent chunks in request mode; see {@link SUB_CHUNK_REQUESTS_SINCE}. */
    private usesSubChunkRequests(): boolean {
        return this.connection.codec.context.protocolVersion >= SUB_CHUNK_REQUESTS_SINCE;
    }

    private prepareQueuedChunk(chunk: Chunk): QueuedChunk {
        const payload = this.usesSubChunkRequests()
            ? chunk.networkSerializeRequestSkeleton()
            : chunk.networkSerialize();
        return {
            chunk,
            payload,
            revision: chunk.getNetworkRevision(),
            memoryBytes: payload.byteLength
        };
    }

    private hasChunkQueueCapacity(bytes: number): boolean {
        return this.queuedChunkBytes + bytes <= this.queuedChunkBytesLimit;
    }

    private releaseChunkQueueBytes(bytes: number): void {
        this.queuedChunkBytes -= bytes;
        for (const resolve of this.chunkQueueCapacityWaiters) resolve();
        this.chunkQueueCapacityWaiters.clear();
    }

    /**
     * How badly this player needs one of their chunks, by how close it is to them.
     *
     * The queue is already drained nearest first, so this is about what happens when the
     * generator is behind: the ring a player can see into has to come before the rim of
     * somebody else's view distance, whichever was asked for first.
     *
     * Chebyshev distance, because that is the shape of a view distance square.
     *
     * @param x - Chunk x.
     * @param z - Chunk z.
     */
    private urgencyOf(x: number, z: number): GenerationPriority {
        if (this.lastChunkX === null || this.lastChunkZ === null) return 'immediate';

        const distance = Math.max(Math.abs(x - this.lastChunkX), Math.abs(z - this.lastChunkZ));
        if (distance <= URGENT_CHUNK_DISTANCE) return 'immediate';

        return distance <= this.player.viewDistance / 2 ? 'soon' : 'idle';
    }

    /**
     * Clear the currently loaded and loading chunks.
     *
     * @remarks
     * Usually used for changing dimension, world, etc.
     *
     * Everything in flight goes with them. The two sets are only the bookkeeping; the queue
     * of coordinates still to send and the chunks already produced but not yet dispatched
     * are the actual work, and they belong to the world being left. Left in place, a
     * dimension change sent the old world's terrain into the new one, and resolved the
     * leftover coordinates against a world where they mean somewhere else entirely.
     */
    public async clearChunks() {
        this.chunkEpoch += 1;
        this.loadedChunks.clear();
        this.loadingChunks.clear();
        this.chunkSender.clear();
        const abandonedBytes = this.chunkSendQueue.reduce((total, { memoryBytes }) => total + memoryBytes, 0);
        this.chunkSendQueue.length = 0;
        this.releaseChunkQueueBytes(abandonedBytes);

        // So the next `update` sees a chunk change and asks for terrain again, rather than
        // comparing against where the player stood in the world it just left.
        this.lastChunkX = null;
        this.lastChunkZ = null;
    }

    /**
     * The id the client will name a block's stack by, or null for an empty slot.
     *
     * A stack sent without one cannot be picked up: the server authoritative inventory has
     * nothing to name it by, so the click on a furnace's input never became a request.
     */
    private stackIdFor(item: Item): number | null {
        const id = this.player.getInventory().assignStackNetworkId(item);
        return id > 0 ? id : null;
    }

    /**
     * Tells the client what the player is carrying.
     *
     * The send was commented out, so the client was never told: it had no model of the
     * player's own slots, and the server authoritative inventory system will not move a stack
     * into a container it does not know. Every drag was refused on the client's side, before
     * an `ItemStackRequest` was ever sent.
     */
    public async sendInventory(windowId: number = WindowIds.INVENTORY): Promise<void> {
        const inventory = this.player.getInventory();
        const context = this.connection.codec.context;
        // Every stack goes out with the id the client will name it by in its requests.
        inventory.assignStackNetworkIds();

        const pk = new InventoryContentPacket();
        pk.items = inventory.getItems(true).map((entry) => {
            const item = entry.toItemStack().withCount(entry.getCount());
            return item.toStackDescriptor(context, item.stackNetworkId > 0 ? item.stackNetworkId : null);
        });
        pk.windowId = windowId;
        await this.connection.sendDataPacket(pk);

        // Through the entry rather than `getItemInHand`, which hands back an empty slot's air
        // as though it were an item and cannot be written out.
        const hand = inventory.getEntry(inventory.getHandSlotIndex());
        if (hand) await this.sendHandItem(hand.toItemStack());

        // The armor container is a window of its own, so the main inventory's contents say
        // nothing about it and a player would open their screen to four empty slots. Its
        // `Full Container Name` has to say armor too: the packet defaults to the player's
        // combined hotbar and inventory, which named the wrong container for window 120.
        const armor = new InventoryContentPacket();
        armor.items = inventory
            .getArmor()
            .getItems(true)
            .map((entry) => {
                const item = entry.toItemStack().withCount(entry.getCount());
                return item.toStackDescriptor(context, item.stackNetworkId > 0 ? item.stackNetworkId : null);
            });
        armor.windowId = WindowIds.ARMOR;
        armor.containerId = ContainerUiId.ARMOR_CONTAINER;
        await this.connection.sendDataPacket(armor);

        await this.sendArmorFor(this.player);
    }

    /**
     * Tells this client that one slot of a container it has open now holds something else.
     *
     * An `ItemStackResponse` only ever reaches the client that sent the request, so this is the
     * only way to tell the other players standing at the same chest that a stack has gone.
     *
     * @param windowId - The `Container Id` this client opened the block under, which is its own.
     * @param containerId - The `Container Name` the client numbers the slot by.
     * @param slot - The slot within that container.
     * @param item - What is in it now, or `null` to empty it.
     */
    public async sendContainerSlot(
        windowId: number,
        containerId: number,
        slot: number,
        item: Item | null
    ): Promise<void> {
        const packet = new InventorySlotPacket();
        packet.windowId = windowId;
        packet.containerId = containerId;
        packet.inventorySlot = slot;
        packet.item =
            item?.toStackDescriptor(
                this.connection.codec.context,
                item.stackNetworkId > 0 ? item.stackNetworkId : null
            ) ?? null;

        await this.connection.sendDataPacket(packet);
    }

    /**
     * Opens the player's own inventory, as the client asked.
     *
     * Under its own window id rather than under zero. Zero is the inventory the client always
     * has open; asking it to *open* that one is asking for something it is already doing, and
     * it answered by closing the window again straight away - which is as far as opening an
     * inventory ever got, so no drag inside it was ever attempted.
     *
     * The contents follow the open, because a window whose contents never arrive is one the
     * client has no reason to keep.
     * @see https://github.com/pmmp/PocketMine-MP/blob/stable/src/network/mcpe/InventoryManager.php (onClientOpenMainInventory)
     */
    public async openMainInventory(): Promise<void> {
        const packet = new ContainerOpenPacket();
        packet.windowId = this.nextWindowId();
        packet.containerType = WindowTypes.INVENTORY;
        // No position: a container an actor carries is named by the actor, not by a block.
        packet.containerEntityId = this.player.getRuntimeId();
        this.openWindows.set(packet.windowId, packet.containerType);
        await this.connection.sendDataPacket(packet);

        await this.sendInventory(packet.windowId);
    }

    /**
     * Opens the screen a block draws, with whatever the block is holding.
     *
     * The one call the interaction path needs. Until this existed no block opened a container
     * anywhere in this server: a chest, a furnace and a crafting table all did nothing when
     * they were clicked, because `openMainInventory` was the only `ContainerOpen` ever sent.
     *
     * The contents follow the open for the same reason they do there: a window whose contents
     * never arrive is one the client has no reason to keep. Each packet uses the container name
     * that screen assigns to its slots, so a furnace's fuel list arrives under its fuel name.
     * A workstation stores nothing of its own, so no contents follow its open. A crafting table
     * is followed by the player's own inventory under window 0 instead, which is what a Bedrock
     * Dedicated Server 1.26.52 sent after a click on one. Repeated requests for the same open
     * block return the current window without sending another open packet.
     *
     * @param at - The block position, which is what `ContainerOpen` carries for a block.
     * @param identifier - The block standing there, which decides the screen.
     * @param contents - What the block holds, one entry per slot.
     * @returns The window it was opened under, or undefined when the block opens no screen.
     */
    public async openBlockContainer(
        at: Vector3,
        identifier: string,
        contents: ContainerEntry[] = []
    ): Promise<OpenBlockContainer | undefined> {
        const container = blockContainerOf(identifier);
        if (container === undefined) return undefined;

        const current = this.blockContainer;
        if (
            current?.identifier === identifier &&
            current.position.getX() === at.getX() &&
            current.position.getY() === at.getY() &&
            current.position.getZ() === at.getZ()
        ) {
            return current;
        }

        const packet = new ContainerOpenPacket();
        packet.windowId = this.nextWindowId();
        packet.containerType = container.screen;
        packet.containerPos = at;
        // -1 for a block's container, which is what the field means: the actor it belongs to,
        // and a block is not an actor.
        packet.containerEntityId = -1n;
        this.openWindows.set(packet.windowId, packet.containerType);
        // A fresh screen has been told nothing yet, so the next tick sends it everything.
        this.containerData.clear();
        const opened: OpenBlockContainer = {
            windowId: packet.windowId,
            position: at,
            identifier,
            screen: container.screen,
            inputs: [null, null, null],
            bookshelfPower: 0
        };
        this.blockContainer = opened;

        try {
            await this.connection.sendDataPacket(packet);

            // What the caller read out of the block rather than what the block type says it holds:
            // a double chest is 54 entries from two block entities, which `blockContainerOf` does
            // not know about and the caller does.
            if (contents.length > 0) {
                const context = this.connection.codec.context;

                // Furnaces and brewing stands expose named containers for requests, but their
                // open packet is followed by one complete primary inventory. Sending one partial
                // content packet per named slot leaves clients without the window's full storage
                // model, so moves into those slots are rejected before a request is sent.
                if (COMBINED_BLOCK_CONTENT_SCREENS.has(container.screen)) {
                    const content = new InventoryContentPacket();
                    content.windowId = packet.windowId;
                    content.containerId = ContainerUiId.LEVEL_ENTITY_CONTAINER;
                    content.items = contents.map((entry) => {
                        const item = entry.toItemStack().withCount(entry.getCount());
                        return item.toStackDescriptor(context, this.stackIdFor(item));
                    });
                    await this.connection.sendDataPacket(content);
                } else {
                    // Screens with separate primary inventories name each complete slot list
                    // under the container the client uses for requests to that part of the screen.
                    const byContainer = new Map<number, ContainerEntry[]>();
                    contents.forEach((entry, slot) => {
                        const named = blockSlotName(container.screen, slot);
                        const slots = byContainer.get(named.containerId) ?? [];
                        slots[named.slotId] = entry;
                        byContainer.set(named.containerId, slots);
                    });

                    for (const [containerId, slots] of byContainer) {
                        const content = new InventoryContentPacket();
                        content.windowId = packet.windowId;
                        content.containerId = containerId;
                        content.items = slots.map((entry) => {
                            const item = entry.toItemStack().withCount(entry.getCount());
                            return item.toStackDescriptor(context, this.stackIdFor(item));
                        });
                        await this.connection.sendDataPacket(content);
                    }
                }
            }

            // What a Bedrock Dedicated Server 1.26.52 sent after a click on a crafting table: the
            // open, then the player's inventory under window 0. The other workstations were not
            // recorded, and send nothing more until they are.
            if (container.screen === WindowTypes.WORKBENCH) await this.sendInventory();
        } catch (error) {
            this.openWindows.delete(packet.windowId);
            if (this.blockContainer === opened) this.blockContainer = current;
            throw error;
        }

        return opened;
    }

    /**
     * Opens a villager's trade screen and shows it the trader's offers.
     *
     * The screen is a window like a block's: it has two payment slots the player's items go into
     * and a result the trade comes out of, and closing it gives the payment back. It differs in
     * being open on an actor, which the packet names, and in what follows the open: an
     * `UpdateTradePacket` carrying the offers, which the client draws the screen from.
     *
     * @param trade - The trader, where its offers come from and what happens when the player leaves.
     * @returns The window, or undefined when this session already has a trade open on that trader.
     */
    public async openTradeWindow(trade: OpenTrade): Promise<OpenBlockContainer | undefined> {
        if (this.blockContainer?.trade?.trader === trade.trader) return undefined;
        this.releaseTrade();

        const packet = new ContainerOpenPacket();
        packet.windowId = this.nextWindowId();
        packet.containerType = WindowTypes.TRADE;
        packet.containerPos = trade.trader.getPosition();
        packet.containerEntityId = trade.trader.getRuntimeId();
        this.openWindows.set(packet.windowId, packet.containerType);
        this.containerData.clear();
        const opened: OpenBlockContainer = {
            windowId: packet.windowId,
            position: trade.trader.getPosition(),
            identifier: trade.trader.getType(),
            screen: WindowTypes.TRADE,
            inputs: [null, null],
            bookshelfPower: 0,
            trade
        };
        this.blockContainer = opened;

        try {
            await this.connection.sendDataPacket(packet);
            await this.sendTradeOffers(opened);
        } catch (error) {
            this.openWindows.delete(packet.windowId);
            if (this.blockContainer === opened) this.blockContainer = undefined;
            trade.release();
            throw error;
        }

        return opened;
    }

    /** Sends the open trade screen the trader's offers as they stand, after a trade or a restock. */
    public async sendTradeOffers(window: OpenBlockContainer | undefined = this.blockContainer): Promise<void> {
        const trade = window?.trade;
        if (window === undefined || trade === undefined) return;

        const context = trade.context();
        const offers = trade.source.offers(context);
        const packet = new UpdateTradePacket({
            containerId: window.windowId,
            type: WindowTypes.TRADE,
            size: offers.length,
            traderTier: trade.source.level - 1,
            entityUniqueId: trade.trader.getRuntimeId(),
            lastTradingPlayer: this.player.getRuntimeId(),
            displayName: trade.title ?? trade.trader.getName(),
            useNewTradeScreen: true,
            usingEconomyTrade: true,
            data: tradeOffersPayload(offers, trade.source.tierRequirements())
        });
        await this.connection.sendDataPacket(packet);
    }

    /** Tells the trader the player has stopped trading, if a trade screen is open. */
    private releaseTrade(): void {
        const trade = this.blockContainer?.trade;
        if (trade === undefined) return;

        this.blockContainer = undefined;
        trade.release();
    }

    /** The block container this session has open, or undefined for none. */
    public getOpenBlockContainer(): OpenBlockContainer | undefined {
        return this.blockContainer;
    }

    /**
     * Sets properties on the open block container's screen, which is how a progress bar moves.
     *
     * A property whose value has not changed since the last send is skipped; see
     * {@link PlayerSession.containerData}. Nothing is sent when the screen was opened from a
     * different block, so a station ticking across the world cannot write over the screen the
     * player is actually looking at.
     *
     * @param at - The block the properties belong to.
     * @param properties - The property values by id, as the station reports them.
     */
    public async sendContainerData(at: Vector3, properties: ReadonlyMap<number, number>): Promise<void> {
        const open = this.blockContainer;
        if (open === undefined) return;
        if (
            open.position.getX() !== at.getX() ||
            open.position.getY() !== at.getY() ||
            open.position.getZ() !== at.getZ()
        ) {
            return;
        }

        for (const [id, value] of properties) {
            if (this.containerData.get(id) === value) continue;
            this.containerData.set(id, value);

            const packet = new ContainerSetDataPacket();
            packet.containerId = open.windowId;
            packet.id = id;
            packet.value = value;
            await this.send(packet);
        }
    }

    /**
     * Forgets a window the client reports closed.
     *
     * The docs have the server delete its container manager when the client's `ContainerClose`
     * arrives, before answering it. Only a window this session opened can be closed here; any
     * other id is left alone and reported through the return value so the handler can log it.
     * @param {number} windowId - the `Container Id` the client sent.
     * @returns {boolean} whether a window with that id was open.
     */
    public closeWindow(windowId: number): boolean {
        if (this.blockContainer?.windowId === windowId) {
            const trade = this.blockContainer.trade;
            this.blockContainer = undefined;
            this.containerData.clear();
            trade?.release();
        }

        return this.openWindows.delete(windowId);
    }

    /**
     * The next window id to open a container under.
     *
     * The range is not invented: `ContainerID` documents where a server's own windows begin
     * and end, and everything outside it is spoken for - zero is the player inventory, and
     * the hundreds are the armor, the offhand and the player-only UI. Wrapping keeps a long
     * session inside it.
     */
    private nextWindowId(): number {
        const span = WindowIds.LAST - WindowIds.FIRST + 1;
        this.windowId = ((this.windowId - WindowIds.FIRST + 1) % span) + WindowIds.FIRST;

        return this.windowId;
    }

    /**
     * Tells the client which recipes exist.
     *
     * Until it has these the client proposes nothing and never sends a `CRAFTING_RECIPE`, so
     * everything below this - the matcher, the stations, the grid - is invisible without it.
     *
     * The recipes come from the content build's recipe book, and a recipe's net id is its
     * position in that book, which is what an `ItemStackRequest` names it by. A build that
     * produced no payload sends nothing, so the client proposes nothing it cannot craft.
     *
     * How many go out is `crafting-recipe-limit` in the config: `0` sends nothing, `-1`
     * sends everything, and it starts at one. See there for why.
     */
    public async sendCraftingData(): Promise<void> {
        const limit = this.server.getConfig().getCraftingRecipeLimit();
        if (limit === 0) return;

        const content = this.server.getContent();
        const payloads = joinContentPayloads(content, this.server.getLogger(), {
            itemData: this.connection.codec.itemData
        });
        if (payloads === undefined || craftingRecipeCount(payloads.crafting) === 0) return;

        const all = craftingRecipeCount(payloads.crafting);
        const crafting = limit < 0 ? payloads.crafting : limitCraftingData(payloads.crafting, limit);

        await sendCachedJoinPacket(
            this.connection,
            content,
            limit,
            this.server.getConfig().getPacketCompressionLevel(),
            new CraftingDataPacket(crafting)
        );

        const sent = craftingRecipeCount(crafting);
        this.server.getLogger().debug(`Sent §b${sent}§r of §b${all}§r recipe(s) to ${this.player.getName()}`);
    }

    public async sendCreativeContents(empty = false): Promise<void> {
        if (empty) {
            await this.connection.sendDataPacket(new CreativeContentPacket({ groups: [], entries: [] }));
            return;
        }

        // The same list a creative pick is resolved through, so that the position the client
        // sends back names the entry it was shown. `creativePick` reads the same two sources
        // in the same order.
        const server = this.player.getServer();
        const content = server.getContent();
        const payloads = joinContentPayloads(content, server.getLogger(), {
            itemData: this.connection.codec.itemData
        });
        if (payloads === undefined) {
            const creative = server.getCreativeInventory();
            await this.connection.sendDataPacket(
                new CreativeContentPacket(creativeContentFrom(creative.getGroups(), creative.getEntries()))
            );
            return;
        }

        await sendCachedJoinPacket(
            this.connection,
            content,
            this.server.getConfig().getCraftingRecipeLimit(),
            this.server.getConfig().getPacketCompressionLevel(),
            new CreativeContentPacket(payloads.creative)
        );
    }

    /**
     * Sets the item in the player hand.
     * @param {Item} item - The entity.
     */
    public async sendHandItem(item: Item): Promise<void> {
        const slot = this.player.getInventory().getHandSlotIndex();
        await this.connection.sendDataPacket(
            new MobEquipmentPacket({
                runtimeEntityId: this.player.getRuntimeId(),
                item: item.toStackDescriptor(this.connection.codec.context),
                inventorySlot: slot,
                hotbarSlot: slot,
                windowId: WindowIds.INVENTORY
            })
        );
    }

    /**
     * Send the current tick to a client.
     * @param {number} tick - The tick
     */
    public async sendTime(tick: number): Promise<void> {
        const pk = new SetTimePacket({ time: tick });
        await this.connection.sendDataPacket(pk);
    }

    /**
     * Send gamemode to a client.
     * @param {Gametype} gamemode - the numeric gamemode ID.
     */
    public async sendGamemode(gamemode?: Gametype): Promise<void> {
        const packet = new SetPlayerGameTypePacket({ gametype: gamemode ?? this.player.gamemode });
        await this.connection.sendDataPacket(packet);
    }

    /**
     * Tells this client which game type a player now has.
     *
     * `UpdatePlayerGameTypePacket` is what the docs have the server send to every client after
     * it accepts a game type change, because each client caches the game type and permission
     * flags of every player it knows about. The Tick is this client's last input tick when the
     * player is its own, so the client can reconcile the movement it predicted while the packet
     * was in flight, and zero for anyone else, as the docs allow.
     * @param {Player} target - The player whose game type changed.
     */
    public async sendGameTypeFor(target: Player): Promise<void> {
        const packet = new UpdatePlayerGameTypePacket({
            playerGameType: target.gamemode,
            targetPlayer: target.getRuntimeId(),
            tick: target === this.player ? this.lastInputTick : 0n
        });
        await this.connection.sendDataPacket(packet);
    }

    /**
     * Tells this client that game rules changed.
     * @param {GameRule[]} rules - The rules that changed, spelled as the client spells them.
     */
    public async sendGameRules(rules: GameRule[]): Promise<void> {
        const packet = new GameRulesChangedPacket();
        packet.rulesList = rules;
        await this.connection.sendDataPacket(packet);
    }

    public async sendNetworkChunkPublisher(distance: number, savedChunks: ChunkCoord[]): Promise<void> {
        const position = BlockPosition.fromVector3(this.player.getPosition());
        const pk = new NetworkChunkPublisherUpdatePacket({
            position: { x: position.getX(), y: position.getY(), z: position.getZ() },
            radius: distance << 4,
            savedChunks
        });
        await this.connection.sendDataPacket(pk);
    }

    /**
     * Tells the client which commands this player may run and what each one takes.
     *
     * One `CommandData` per command, each branch of its tree an overload, with overloads that
     * come out the same folded into one. Only commands the player's permissions allow are
     * sent, so the list is built per recipient and sent again when those permissions change.
     *
     * The list is the command manager's one registry, already flattened into Bedrock's
     * overload shape by `@jsprismarine/commands`, which carries chained subcommands and
     * therefore the chained `/execute` tree.
     */
    public async sendAvailableCommands(): Promise<void> {
        const pk = new AvailableCommandsPacket();
        // The names `/ban` and `/pardon` complete from. The packet keeps the first soft enum of a
        // name it meets, so this one, with values, wins over the empty one a parameter names.
        const players = new CommandEnum();
        players.soft = true;
        players.name = PLAYER_SOFT_ENUM;
        players.values = this.server
            .getSessionManager()
            .getAllPlayers()
            .map((player) => player.getName());
        pk.softEnums = [players];

        const commandManager = this.server.getCommandManager();
        for (const command of commandManager.getVanillaCommandList()) {
            const permission = commandPermissionOf(command.name);
            if (!this.server.getPermissionManager().can(this.player).execute(permission)) continue;

            // The level the command declares, capped at the player's own: a
            // client hides a command whose level is above its own even though
            // the server would run it, which is what a player granted one
            // operator command by name would otherwise see.
            const own = this.player.isOp() ? CommandPermissionLevel.OWNER : CommandPermissionLevel.ANY;
            pk.commandData.push(commandDataOf(command, Math.min(command.permissionLevel, own)));
        }

        await this.getConnection().sendDataPacket(pk);
    }

    /**
     * Set the client's maximum view distance.
     *
     * @param distance - The view distance
     */
    public async setViewDistance(distance: number): Promise<void> {
        this.player.viewDistance = distance;
        const packet = new ChunkRadiusUpdatedPacket({ radius: distance });
        await this.connection.sendDataPacket(packet);

        // A retail client discards every LevelChunk that reaches it before it has asked for a
        // radius and been answered with the ChunkRadiusUpdated above - that exchange is the
        // handshake that opens the window it will accept terrain in. So the spawn chunks and the
        // PlayerSpawn status wait for the first radius request, here, rather than going out in
        // the join burst. Sending them earlier left a real client with a radius but no terrain:
        // it threw the early chunks away, was never sent them again, and sat at world generation
        // without ever sending SetLocalPlayerAsInitialized. The server's own client tolerated the
        // wrong order, which is why nothing here was ever caught. A later radius change just tops
        // the chunks up.
        if (this.spawnChunksSent) {
            await this.needNewChunks();
            return;
        }

        this.spawnChunksSent = true;
        this.spawnChunksPending = true;
        await this.player.sendInitialSpawnChunks();

        // Nothing queued - there is no flush coming that would do it, so announce here.
        await this.announceSpawnIfReady();
    }

    /**
     * Answers a respawn change with the two `Respawn` states once its terrain is on the wire.
     * Called whenever a batch of chunks lands, and when the change is made.
     */
    private async answerRespawnIfReady(): Promise<void> {
        const at = this.pendingRespawnAnswer;
        if (at === undefined) return;
        if (this.loadingChunks.size > 0 || this.chunkSendQueue.length > 0) return;

        this.pendingRespawnAnswer = undefined;
        await this.sendRespawn(at, PlayerRespawnState.SEARCHING_FOR_SPAWN);
        await this.sendRespawn(eyePositionAt(at), PlayerRespawnState.READY_TO_SPAWN);
    }

    /**
     * Tells the client it has spawned, once the terrain it spawns into is actually on the wire.
     *
     * The order is taken from a Bedrock Dedicated Server 1.26.51: it answers `RequestChunkRadius`
     * with `ChunkRadiusUpdated`, streams every spawn chunk, and only then sends
     * `PlayStatus(PlayerSpawn)` - with the entity spawns after that again. This server sent the
     * status first and the entities before any terrain, which tells a real client it has spawned
     * into a world it has no ground for: it waits, never sends `SetLocalPlayerAsInitialized`, and
     * drops the connection. The server's own client did not care about any of it.
     */
    private async announceSpawnIfReady(): Promise<void> {
        if (!this.spawnChunksPending) return;
        if (this.loadingChunks.size > 0 || this.chunkSendQueue.length > 0) return;

        this.spawnChunksPending = false;
        await this.sendPlayStatus(PlayStatus.PlayerSpawn);
        await this.reconcileTrackedEntities();
    }

    /**
     * Send the player's whole attribute set.
     *
     * The client rebuilds the local player during the spawn sequence, so this has to be sent
     * again once the player is in the world - anything sent before that is thrown away, which
     * is why the hunger bar sat empty however correct the values were here.
     * @param {Attributes} [attributes=this.player.attributes] - The attributes to send.
     */
    public async sendAttributes(attributes: Attributes = this.player.attributes): Promise<void> {
        await this.sendAttributeList(attributes.getAttributes());
        attributes.clearDirty();
    }

    /**
     * Send only the attributes that changed since the last sync, if any.
     *
     * Called every tick from {@link Player.update}: a value nothing tells the client about is
     * a value that only exists on the server.
     */
    public async syncAttributes(): Promise<void> {
        const dirty = this.player.attributes.getDirty();
        if (dirty.length === 0) return;

        await this.sendAttributeList(dirty);
        this.player.attributes.clearDirty();
    }

    private async sendAttributeList(attributes: Attribute[]): Promise<void> {
        await this.sendAttributesFor(this.player, attributes);
    }

    /**
     * Tell this client about *another* entity's changed attributes.
     *
     * The gap that made mob combat invisible. Everything above sends the local player's own
     * attributes, with their runtime id baked in, so a mob losing health changed a number on the
     * server that no client was ever told about - the health bar over a hurt zombie never moved,
     * and it died in one apparent hit from full. Attributes only reached a client once, inside
     * the `AddActorPacket` that spawned the entity.
     * @param {Entity} entity - Whose attributes these are.
     * @param {Attribute[]} attributes - The ones that changed; nothing is sent for an empty list.
     */
    public async sendAttributesFor(entity: Entity, attributes: Attribute[]): Promise<void> {
        if (attributes.length === 0) return;

        const packet = new UpdateAttributesPacket();
        packet.runtimeEntityId = entity.getRuntimeId();
        packet.attributes = attributes;
        // `PlayerInputTick`: the client's last input tick for its own player, zero for anything
        // that is not the player, as the docs ask. See {@link PlayerSession.recordInputTick}.
        packet.tick = entity === this.player ? this.lastInputTick : 0n;
        await this.connection.sendDataPacket(packet);
    }

    /**
     * Remember the tick of a `PlayerAuthInputPacket` just handled, so packets about this player
     * can carry it as their `PlayerInputTick`.
     *
     * Ticks only move forward; an input that arrives out of order does not wind the value back.
     * @param {bigint} tick - The packet's `Tick` field.
     */
    public recordInputTick(tick: bigint): void {
        if (tick > this.lastInputTick) this.lastInputTick = tick;
    }

    /**
     * Hands out the `Loading Screen Id` for a `ChangeDimensionPacket` about to be sent, and
     * remembers it until {@link PlayerSession.endLoadingScreen} hears the client close that
     * screen.
     * @returns A uint32 no other open screen on this session uses.
     */
    public beginLoadingScreen(): number {
        const id = this.nextLoadingScreenId;
        this.nextLoadingScreenId = (id + 1) >>> 0;
        this.openLoadingScreens.add(id);
        return id;
    }

    /**
     * Records that the client closed a loading screen.
     * @param {number} id - The `Loading Screen Id` from the client's `ServerboundLoadingScreenPacket`.
     * @returns Whether the id belonged to a screen this session had opened and not yet closed.
     */
    public endLoadingScreen(id: number): boolean {
        return this.openLoadingScreens.delete(id);
    }

    /**
     * Moves the player to another world and walks the client through the dimension change.
     *
     * Server side first: the record is saved to the world being left, stamped with that
     * world's dimension, the player leaves its roster, the old world's entities come off the
     * client, the chunk bookkeeping is cleared, the position moves, and the player joins the
     * new roster. Then the wire sequence Dragonfly, Geyser and Nukkit agree on: one
     * `ChangeDimension` with the target's Bedrock id, `StopSound` for everything playing,
     * `NetworkChunkPublisherUpdate` at the arrival, the server-sent `PlayerAction
     * ChangeDimensionAck`, the arrival chunks, and `PlayStatus PlayerSpawn`. The change stays
     * pending, and the client's `PlayerAuthInput` is dropped, until the client closes the
     * screen with the id this handed out: see {@link PlayerSession.completeDimensionChange}.
     *
     * A client sent `ChangeDimension` to the dimension it is already in never closes the
     * screen, so a move between two worlds of the same Bedrock id detours through another
     * dimension first.
     *
     * A second arrival while a change is pending is held until the client closes the first
     * screen, then carried out; only the latest is kept. A caller whose arrival goes stale
     * while it waits, such as a portal, instead passes `whenPending: 'drop'`: the
     * player is still ticked on the loading screen, and one who arrived inside the exit portal
     * would otherwise be sent back once the 10 tick cooldown ran out, before the client ever
     * closed the first screen. Custom dimension ids are sent after the level announces them in
     * `DimensionData`.
     * @param arrival - The world, feet position and rotation the player lands at.
     * @param options - What to do with this arrival when a change is already pending.
     */
    public async changeWorld(
        arrival: Arrival,
        options: { readonly whenPending?: 'queue' | 'drop' } = {}
    ): Promise<void> {
        const player = this.player;
        const { world } = arrival;
        const target = world.getDimension();

        const pending = this.pendingChange;
        if (pending !== undefined) {
            const queue = (options.whenPending ?? 'queue') === 'queue';
            if (queue) this.queuedChange = arrival;
            this.server
                .getLogger()
                .debug(
                    `${queue ? 'Holding' : 'Dropped'} the move of ${player.getName()} to ${world.getName()}: a change to ${pending.arrival.world.getName()} is pending on loading screen ${pending.loadingScreenId}`,
                    'PlayerSession/changeWorld'
                );
            return;
        }
        // A dead client can leave the screen of a change sent under its death screen unopened, so
        // the change stayed pending for the whole timeout and held every later move behind it.
        // It waits for the respawn instead: see {@link PlayerSession.releaseChangeHeldOverDeath}.
        // The respawn's own change runs while the player is still dead, and is not held.
        if (!player.isAlive() && arrival.closesLoadingScreen !== false) {
            const queue = (options.whenPending ?? 'queue') === 'queue';
            if (queue) this.queuedChange = arrival;
            this.server
                .getLogger()
                .debug(
                    `${queue ? 'Holding' : 'Dropped'} the move of ${player.getName()} to ${world.getName()}: they are dead`,
                    'PlayerSession/changeWorld'
                );
            return;
        }
        const from = player.getWorld();
        const left = from.getDimension();

        // The cracks belong to a block in the world being left.
        await player.stopMining();

        // The record goes to the level being left while the player is still in it, so it
        // carries that world's dimension and the next login finds them where they were should
        // nothing save them again.
        await from.savePlayerData(player);

        // Out of the old world first, so it stops broadcasting to us and its players are told
        // we left. Then the old world's entities come off this client, before `addEntity`
        // below fills the tracker with the new world's.
        await from.removeEntity(player);
        await this.despawnAllTrackedEntities();
        await this.clearChunks();

        // The arrival is feet; the position a player holds is their eyes, like everything their
        // client reports. Raised here and nowhere else, so the stored position, the packet and
        // the teleport that closes the change agree. Written in as feet, the player would
        // stand 1.62 blocks down in the arrival floor.
        const eyes = eyePositionAt(arrival.position);

        // Not broadcast: nobody in the new world sees the player yet, and the client's own
        // teleport waits for the screen to close.
        await player.setPlayerPosition(
            {
                position: Position.fromVector3(eyes, world),
                type: PositionMode.Teleport,
                pitch: arrival.pitch,
                yaw: arrival.yaw,
                headYaw: arrival.yaw
            },
            false
        );
        await world.addEntity(player);

        if (left.bedrockId === target.bedrockId) await this.detourFrom(target.bedrockId, eyes);

        const loadingScreenId = this.beginLoadingScreen();
        // A death's respawn change is not pending: the client does not close a loading screen for
        // it, the `Respawn` exchange that follows settles it. Held as pending, it blocked every
        // later change, a `/tp` into another dimension among them, for the whole timeout.
        if (arrival.closesLoadingScreen !== false) {
            this.pendingChange = { loadingScreenId, arrival, left: left.name, sinceTick: this.server.getTick() };
        }
        await this.send(
            new ChangeDimensionPacket({
                dimension: target.bedrockId,
                position: eyes,
                respawn: arrival.respawn ?? false,
                loadingScreenId
            })
        );

        const stopSound = new StopSoundPacket();
        stopSound.stopAllSounds = true;
        await this.send(stopSound);

        await this.sendNetworkChunkPublisher(effectiveViewDistance(player.viewDistance), []);

        // Since 1.19.50 the server sends the acknowledgement that used to be the client's, and
        // sends it before any chunk; the client still answers with its own copy afterwards.
        await this.send(
            new PlayerActionPacket({
                runtimeEntityId: player.getRuntimeId(),
                action: PlayerActionType.ChangeDimensionAck,
                blockPosition: NO_BLOCK,
                resultPosition: NO_BLOCK,
                blockFace: 0
            })
        );

        await player.sendInitialSpawnChunks();
        await this.sendPlayStatus(PlayStatus.PlayerSpawn);
    }

    /**
     * The four-step detour for a change between two worlds of the same Bedrock id: the
     * current id, another, that other again, and back, each with its own screen and spawn
     * status, ahead of the real `ChangeDimension`. It is what `Player.setWorld` sent for every
     * change before dimensions existed, kept for the one case where the client would
     * otherwise never close the screen.
     * @param position - The eyes the real `ChangeDimension` carries.
     */
    private async detourFrom(bedrockId: number, position: Vector3): Promise<void> {
        const away = bedrockId === Dimension.NETHER ? Dimension.OVERWORLD : Dimension.NETHER;
        for (const dimension of [bedrockId, away, away]) {
            await this.send(
                new ChangeDimensionPacket({
                    dimension,
                    position,
                    respawn: false,
                    loadingScreenId: this.beginLoadingScreen()
                })
            );
            await this.sendPlayStatus(PlayStatus.PlayerSpawn);
        }
    }

    /**
     * Carries out the change {@link PlayerSession.changeWorld} held while the player was dead.
     * Called by `Player.respawn` once the client is told its player is alive. A change still
     * pending, the respawn's own included, carries the held one out when it closes instead.
     */
    public async releaseChangeHeldOverDeath(): Promise<void> {
        if (this.pendingChange !== undefined) return;
        const queued = this.queuedChange;
        this.queuedChange = undefined;
        if (queued !== undefined) await this.changeWorld(queued);
    }

    /**
     * The world change the client has not yet finished loading into, or undefined when the
     * player is settled. While one is pending, the client's positions are still the old
     * world's and `PlayerAuthInputHandler` drops them.
     */
    public pendingDimensionChange(): PendingDimensionChange | undefined {
        return this.pendingChange;
    }

    /**
     * Rolls the end credits on the client and holds the arrival until they finish.
     *
     * Sent on a player's first exit through the End's portal. The world change waits for the
     * client's `ShowCredits Finished` rather than going out under the credits screen, because
     * a `ChangeDimension` during the credits has not been verified against a retail client
     * (open question 4 of the End dragon fight plan); Java holds its transfer the same way,
     * on the `PERFORM_RESPAWN` exchange. While the arrival is held, the client's
     * `PlayerAuthInput` is dropped, as during a pending dimension change. The held change is
     * completed by {@link PlayerSession.completeCredits}. A disconnect in between strands
     * nobody: the player record already carries `seenCredits`, so the next join finds the
     * player still in the End, standing in the portal, and transfers them at once.
     *
     * A second start while one is pending is logged at debug and dropped, like a second
     * `changeWorld`.
     * @param arrival - Where the player lands once the credits are over.
     */
    public async startCredits(arrival: Arrival): Promise<void> {
        if (this.pendingCredits !== undefined) {
            this.server
                .getLogger()
                .debug(
                    `Refused to roll the credits for ${this.player.getName()}: they are already rolling`,
                    'PlayerSession/startCredits'
                );
            return;
        }

        this.pendingCredits = arrival;
        const packet = new ShowCreditsPacket();
        packet.playerRuntimeId = this.player.getRuntimeId();
        packet.creditsState = CreditsState.Start;
        await this.send(packet);
    }

    /**
     * Finishes held credits: the full dimension change sequence to the held arrival, sent as
     * a respawn, which is how Java's `PlayerList.respawn(player, true, ...)` answers the
     * credits. Called by `ShowCreditsHandler` when the client reports the credits finished.
     * @returns Whether credits were pending. A finish with none pending changes nothing.
     */
    public async completeCredits(): Promise<boolean> {
        const arrival = this.pendingCredits;
        if (arrival === undefined) return false;

        this.pendingCredits = undefined;
        await this.changeWorld({ ...arrival, respawn: true, closesLoadingScreen: false });

        // A respawn change is settled by the respawn exchange, as after a death: the client
        // waits for where it comes back and shows its loading screen until it is told, so
        // without it the client sat there until the server gave up on it a minute later. It goes
        // out once the terrain is on the wire: told sooner, the client stands the player in a
        // world with no ground and falls through it.
        this.pendingRespawnAnswer = arrival.position;
        await this.answerRespawnIfReady();
        return true;
    }

    /**
     * The arrival held while the credits roll on the client, or undefined when none are.
     * While one is held, the client's `PlayerAuthInput` is dropped, as it is during a pending
     * dimension change.
     */
    public pendingCreditsArrival(): Arrival | undefined {
        return this.pendingCredits;
    }

    /**
     * Lets the columns of a pending dimension change go out, once the client says it has opened
     * that change's loading screen, and sends the ones already waiting.
     *
     * Until then they are held. A client that decodes a column before it has switched dimension
     * files it under the dimension it is leaving and drops it at the switch, then waits on its
     * loading screen for a column the server believes it has: cinnabar did this on about one full
     * e2e run in two. The client reports the screen open only after its switch has begun, so a
     * column sent from then on lands in the new dimension. Sending the lost ones again is not a
     * remedy: in sub chunk request mode a second `LevelChunk` resets the column the client holds,
     * and a player standing on it falls through. {@link ARRIVAL_HOLD_TICKS} bounds the wait for a
     * client that never reports the screen.
     * @param loadingScreenId - The id the client's `StartLoadingScreen` carried.
     * @returns Whether this released the pending change's columns. Any other id changes nothing.
     */
    public async releaseArrivalChunks(loadingScreenId: number): Promise<boolean> {
        const pending = this.pendingChange;
        if (pending === undefined || pending.loadingScreenId !== loadingScreenId || pending.arrivalReleased === true) {
            return false;
        }
        pending.arrivalReleased = true;
        await this.flush();
        return true;
    }

    /** Whether a pending dimension change is holding its columns back. */
    private holdsArrivalChunks(): boolean {
        const pending = this.pendingChange;
        return pending !== undefined && pending.arrivalReleased !== true;
    }

    /**
     * Finishes a pending world change once the client reports its loading screen closed.
     *
     * Teleports the client to the exact arrival position, re-sends the attributes and the
     * inventory, which a dimension change is not known to keep, tells the client where its
     * spawn point is from the new dimension, and raises the changed dimension advancement
     * hook. Called by `ServerboundLoadingScreenHandler`.
     * @param loadingScreenId - The id the client's `EndLoadingScreen` carried.
     * @returns Whether a change was pending under that id. Any other id changes nothing.
     */
    public async completeDimensionChange(loadingScreenId: number): Promise<boolean> {
        const pending = this.pendingChange;
        if (pending === undefined || pending.loadingScreenId !== loadingScreenId) return false;
        this.pendingChange = undefined;

        const { world } = pending.arrival;
        await this.sendMove(this.player, PositionMode.Teleport);
        await this.sendAttributes();
        await this.sendInventory();
        // The compass and the map point at the spawn across dimensions, so the client needs
        // the spawn's dimension again now that its own has changed.
        await this.send(playerSpawnPositionPacket(this.player, world, await overworldSpawnOf(world)));
        advancementChangedDimension(this.player, pending.left, world.getDimension().name);

        const queued = this.queuedChange;
        this.queuedChange = undefined;
        if (queued !== undefined) await this.changeWorld(queued);
        return true;
    }

    /**
     * Hand the client a velocity and let it move the player itself.
     *
     * The only way to shove a player. Their position is theirs - the server stores what it is
     * told - so setting it from here is overruled by the next movement packet and read as
     * rubber-banding. A velocity is a request the client is happy to honor.
     *
     * The `Tick` is the client's last input tick, as the docs ask for a packet about the
     * player: the client rewinds to that tick, applies the velocity and replays what it
     * predicted since. See {@link PlayerSession.recordInputTick}.
     * @param {Vector3} motion - Blocks per tick, in each axis.
     */
    public async sendMotion(motion: Vector3): Promise<void> {
        const packet = new SetActorMotionPacket();
        packet.runtimeEntityId = this.player.getRuntimeId();
        packet.motion = motion;
        packet.tick = this.lastInputTick;
        await this.connection.sendDataPacket(packet);
    }

    public async sendMetadata(metadata?: Metadata): Promise<void> {
        await this.sendMetadataFor(this.player, metadata);
    }

    /**
     * Tell this client what *another* entity now looks like.
     *
     * The same gap `sendAttributesFor` fills, for the other half of an entity's state: everything
     * above had the local player's runtime id baked in, so metadata reached a client exactly once,
     * inside the packet that spawned the entity. A creeper could light its fuse, a mob could catch
     * fire, and nobody would ever see either.
     * @param {Entity} entity - Whose metadata this is.
     * @param {Metadata} [metadata] - What to send; the entity's own by default.
     */
    public async sendMetadataFor(entity: Entity, metadata?: Metadata): Promise<void> {
        const packet = new SetActorDataPacket();
        packet.runtimeEntityId = entity.getRuntimeId();
        packet.metadata = metadata ?? entity.metadata;
        packet.syncedProperties = entity.getSyncedProperties();
        // `PlayerInputTick`: the client's last input tick for its own player, zero for anything
        // that is not the player, as the docs ask. See {@link PlayerSession.recordInputTick}.
        packet.tick = entity === this.player ? this.lastInputTick : 0n;
        await this.connection.sendDataPacket(packet);
    }

    /**
     * Tells the client its player is alive again, as a Bedrock Dedicated Server 1.26.52 does
     * when the respawn button is pressed: `ActorEvent(SPAWN_ALIVE)` for the player, its
     * health, then its attributes and actor data.
     *
     * No `MovePlayer`: the client has put itself at the `ReadyToSpawn` position already.
     */
    public async sendRespawned(): Promise<void> {
        const event = new ActorEventPacket();
        event.runtimeEntityId = this.player.getRuntimeId();
        event.event = ActorEvent.SPAWN_ALIVE;
        await this.connection.sendDataPacket(event);

        const health = new SetHealthPacket({ health: Math.ceil(this.player.getHealth()) });
        await this.connection.sendDataPacket(health);

        await this.sendAttributes();
        await this.sendMetadata();
    }

    /**
     * One of the server's two halves of the respawn exchange.
     *
     * The order matters and is not obvious. `SearchingForSpawn` goes out the moment
     * the player dies, carrying where they will reappear; the client then shows its death
     * screen. `ReadyToSpawn` is the *answer* to the client saying it has finished
     * loading, and goes out only then.
     *
     * Sending the second in place of the first leaves the client on "Respawning" for ever:
     * it is waiting to be told where it will come back before it will even offer the button.
     *
     * `Player Runtime Id` is always 0, as in every `Respawn` a Bedrock Dedicated Server 1.26.52
     * sends, at the join and after a death.
     * @param {Vector3} position - Where the player will reappear.
     * @param {PlayerRespawnState} state - Which half of the exchange this is.
     * @see https://github.com/pmmp/PocketMine-MP/blob/stable/src/network/mcpe/handler/DeathPacketHandler.php
     */
    public async sendRespawn(position: Vector3, state: PlayerRespawnState): Promise<void> {
        const packet = new RespawnPacket({
            position: { x: position.getX(), y: position.getY(), z: position.getZ() },
            state,
            runtimeEntityId: 0n
        });
        await this.connection.sendDataPacket(packet);
    }

    /**
     * Send a chat message to the client.
     * @param {object} options - The options for the message.
     * @param {string} options.message - The message to send.
     * @param {string} [options.sourceName=''] - The source of the message.
     * @param {string} [options.xuid=''] - The XUID of the player.
     * @param {string} [options.platformChatId=''] - The platform chat ID.
     * @param {string[]} [options.parameters=[]] - The parameters for the message.
     * @param {boolean} [options.needsTranslation=false] - Whether the message needs translation.
     * @param {TextPacketType} [options.type=TextPacketType.Raw] - The type of the message.
     * @returns {Promise<void>} A promise that resolves when the message is sent.
     */
    public async sendMessage({
        message,
        sourceName = '',
        xuid = '',
        platformChatId = '',
        parameters = [],
        needsTranslation = false,
        type = TextPacketType.Raw
    }: {
        message: string;
        sourceName?: string;
        xuid?: string;
        platformChatId?: string;
        parameters?: string[];
        needsTranslation?: boolean;
        type?: TextPacketType;
    }): Promise<void> {
        if (!message) throw new Error('A message is required');

        // `Filtered Message` is the text after chat filtering. A dedicated server leaves it
        // empty for its own messages; repeating the message there doubled the payload.
        const pk = new TextPacket({
            type,
            needsTranslation,
            sourceName,
            message,
            parameters,
            xuid,
            platformChatId,
            filtered: ''
        });
        await this.connection.sendDataPacket(pk);
    }

    /**
     * Sends one player's movement to this client.
     *
     * Named for what it does. It was `broadcastMove`, which reads as a fan-out and is not
     * one - the fan-out is `World.broadcastMove`, and having both made it easy to write the
     * wrong one.
     *
     * For this client's own player the packet is a server-initiated move: a teleport, a
     * respawn, or a reset after a canceled move event. Its `Tick` is the client's last input
     * tick, as the docs ask, so the client rewinds to it and replays its predictions from
     * there. For any other player the packet is what this client sees of them, and the tick is
     * zero because it relates to none of this client's inputs.
     * @param {Player} player - The player that moved.
     * @param {PositionMode} [mode=PositionMode.Normal] - What produced the movement.
     */
    public async sendMove(player: Player, mode = PositionMode.Normal): Promise<void> {
        const position = player.getPosition();
        const packet = new MovePlayerPacket({
            runtimeEntityId: player.getRuntimeId(),
            position: { x: position.getX(), y: position.getY(), z: position.getZ() },
            pitch: player.pitch,
            yaw: player.yaw,
            headYaw: player.headYaw,
            mode,
            onGround: player.isOnGround(),
            // "If client bound this has no meaning", so it is always zero here.
            ridingEntityRuntimeId: 0n,
            // The server does not model why a teleport happened, so the cause is Unknown (0)
            // and the source actor type is 0.
            ...(mode === PositionMode.Teleport ? { teleportCause: 0, teleportItemId: 0 } : {}),
            tick: player === this.player ? this.lastInputTick : 0n
        });
        await this.send(packet);
    }

    /**
     * Adds the client to the player list of every player inside
     * the server and also to the player itself.
     */
    public async addToPlayerList(): Promise<void> {
        const entry = new PlayerListEntry({
            uuid: this.player.getUUID(),
            runtimeId: this.player.getRuntimeId(),
            name: this.player.getName(),
            xuid: this.player.xuid,
            platformChatId: this.player.platformChatId,
            buildPlatform: this.player.device?.os ?? -1,
            skin: this.player.skin!,
            isTeacher: false,
            isHost: false
        });

        this.server.getSessionManager().getPlayerList().set(this.player.getUUID().toString(), entry);

        const packet = new PlayerListPacket();
        packet.type = PlayerListAction.TYPE_ADD;
        packet.entries.push(entry);
        await this.server.broadcastPacket(packet);
    }

    /**
     * Removes a player from other players list
     */
    public async removeFromPlayerList(): Promise<void> {
        const entry = new PlayerListEntry({
            uuid: this.player.getUUID()
        });

        this.server.getSessionManager().getPlayerList().delete(this.player.getUUID().toString());

        const packet = new PlayerListPacket();
        packet.type = PlayerListAction.TYPE_REMOVE;
        packet.entries.push(entry);
        await this.server.broadcastPacket(packet);
    }

    /**
     * Sends the full player list to the player.
     */
    public async sendPlayerList(): Promise<void> {
        const packet = new PlayerListPacket();
        packet.type = PlayerListAction.TYPE_ADD;
        packet.entries = Array.from(this.server.getSessionManager().getPlayerList().values());
        await this.send(packet);
    }

    /**
     * Writes an entity onto this connection.
     *
     * Packet construction lives here rather than on the entity: what goes on the wire is the
     * session's business, and an entity that built its own packets also had to reach into
     * the world for the list of players to send them to.
     * @param {Entity} entity - The entity to show.
     */
    public async sendAddActor(entity: Entity): Promise<void> {
        const packet = new AddActorPacket();
        packet.runtimeEntityId = entity.getRuntimeId();
        packet.type = entity.getType();
        packet.position = entity.getPosition();
        // Whatever the entity is actually doing, where it can say. A projectile spawned with no
        // motion is drawn hanging in the air until the first movement packet catches up with it,
        // which for something crossing three blocks a tick is a visible stutter at the muzzle.
        packet.motion = entity.getVelocity();
        packet.pitch = entity.pitch;
        packet.yaw = entity.yaw;
        packet.headYaw = entity.headYaw;
        packet.metadata = entity.metadata;
        packet.syncedProperties = entity.getSyncedProperties();
        // Health, speed and reach arrive with the entity rather than in a packet of their
        // own afterwards, which is the difference between a mob that is right from its first
        // frame and one that is briefly a default.
        packet.attributes = entity.attributes.getAttributes();
        await this.send(packet);

        // What it is holding and wearing. `AddActorPacket` has no room for equipment, so a mob's
        // weapon has to follow it as a packet of its own - and without this a skeleton fires
        // arrows from an empty fist. Nothing is sent for an entity with empty slots throughout,
        // which every entity that is not a dressed mob is.
        if (Object.values(entity.getEquipment()).some((item) => item !== undefined)) {
            await this.sendEquipmentFor(entity);
        }

        await this.sendStatusEffects(entity);
    }

    /**
     * Sends every active effect after the actor that owns them has spawned.
     * @param {Entity} entity - The spawned actor.
     */
    public async sendStatusEffects(entity: Entity): Promise<void> {
        for (const effect of entity.getStatusEffects()) await this.sendStatusEffect(entity, effect, 'add');
    }

    /**
     * Sends one effect state change to this client.
     * @param {Entity} entity - The actor whose effect changed.
     * @param {StatusEffect} effect - The effect state.
     * @param {StatusEffectChange} change - Whether it was added, updated, or removed.
     */
    public async sendStatusEffect(entity: Entity, effect: StatusEffect, change: StatusEffectChange): Promise<void> {
        const effectId = bedrockMobEffectId(effect.id);
        if (effectId === undefined) return;

        const packet = new MobEffectPacket();
        packet.targetRuntimeId = entity.getRuntimeId();
        packet.eventId =
            change === 'add' ? MobEffectEvent.Add : change === 'update' ? MobEffectEvent.Update : MobEffectEvent.Remove;
        packet.effectId = effectId;
        packet.effectAmplifier = effect.amplifier;
        packet.showParticles = effect.showParticles;
        packet.effectDurationTicks = effect.durationTicks;
        packet.tick = entity === this.player ? this.lastInputTick : 0n;
        packet.ambient = effect.ambient;
        await this.send(packet);
    }

    /**
     * Tells this client what a human is wearing and holding in the off hand.
     *
     * All four armor pieces at once, empty ones included as air: the packet is positional and
     * a client that was sent three would read the next packet's bytes as the fourth. `Body` is
     * the body armor slot, which `HumanInventory` does not model, so it is always air. It used
     * to carry the off-hand item, which the client took for body armor.
     *
     * The off hand goes out as a `MobEquipmentPacket` for the offhand container, the way the
     * client reports its own off-hand changes.
     * @param {Human} wearer - Whose armor it is.
     */
    public async sendArmorFor(wearer: Human): Promise<void> {
        const inventory = wearer.getInventory();
        const armor = inventory.getArmor();

        const context = this.connection.codec.context;
        await this.send(
            new MobArmorEquipmentPacket({
                runtimeEntityId: wearer.getRuntimeId(),
                head: armor.getItem(0).toStackDescriptor(context),
                chest: armor.getItem(1).toStackDescriptor(context),
                legs: armor.getItem(2).toStackDescriptor(context),
                feet: armor.getItem(3).toStackDescriptor(context),
                body: Item.air().toStackDescriptor(context)
            })
        );

        // The offhand container has a single slot, so both slot fields are zero.
        await this.send(
            new MobEquipmentPacket({
                runtimeEntityId: wearer.getRuntimeId(),
                item: inventory.getOffhand().getItem(0).toStackDescriptor(context),
                inventorySlot: 0,
                hotbarSlot: 0,
                windowId: WindowIds.OFFHAND
            })
        );
    }

    /**
     * Tells this client everything one entity is holding and wearing.
     *
     * The mob counterpart of {@link PlayerSession.sendArmorFor}, which reads a `Human`'s armor
     * container and so cannot serve anything that has no inventory. A data-driven mob keeps its
     * equipment on the body itself, rolled from `minecraft:equipment`.
     *
     * Both packets go out whatever the entity is wearing, rather than only the occupied slots.
     * `MobArmorEquipmentPacket` is positional, so a client sent three pieces reads the next
     * packet's bytes as the fourth, and an empty slot has to travel as air. The main hand is a
     * separate packet because that is the one the client reads a held item from; the off hand
     * follows only when something is in it, the way vanilla sends it.
     * @param {Entity} entity - Whose equipment it is.
     */
    public async sendEquipmentFor(entity: Entity): Promise<void> {
        const worn = entity.getEquipment();

        const context = this.connection.codec.context;
        await this.send(
            new MobArmorEquipmentPacket({
                runtimeEntityId: entity.getRuntimeId(),
                head: (worn.head ?? Item.air()).toStackDescriptor(context),
                chest: (worn.chest ?? Item.air()).toStackDescriptor(context),
                legs: (worn.legs ?? Item.air()).toStackDescriptor(context),
                feet: (worn.feet ?? Item.air()).toStackDescriptor(context),
                body: (worn.body ?? Item.air()).toStackDescriptor(context)
            })
        );

        await this.sendHeldItemFor(entity, worn.mainhand ?? Item.air());

        if (worn.offhand === undefined) return;

        // The offhand container has a single slot, so both slot fields are zero.
        await this.send(
            new MobEquipmentPacket({
                runtimeEntityId: entity.getRuntimeId(),
                item: worn.offhand.toStackDescriptor(context),
                inventorySlot: 0,
                hotbarSlot: 0,
                windowId: WindowIds.OFFHAND
            })
        );
    }

    /**
     * Tells this client what another entity is holding.
     * @param {Entity} entity - Whose hand it is in.
     * @param {Item} item - What they are holding.
     */
    public async sendHeldItemFor(entity: Entity, item: Item): Promise<void> {
        // A mob has no inventory to name a slot in; vanilla sends zero for both.
        await this.send(
            new MobEquipmentPacket({
                runtimeEntityId: entity.getRuntimeId(),
                item: item.toStackDescriptor(this.connection.codec.context),
                inventorySlot: 0,
                hotbarSlot: 0,
                windowId: 0
            })
        );
    }

    /**
     * Writes a dropped item onto this connection.
     * @param {Item} item - The item entity to show.
     */
    public async sendAddItemActor(item: ItemEntity): Promise<void> {
        const stack = item.getItem();
        if (!stack) return;

        // Sent as BDS sends it, so the client draws the drop leaving its block rather than hanging
        // still until the first movement packet arrives.
        const context = this.connection.codec.context;
        const runtimeEntityId = item.getRuntimeId();
        await this.connection.sendDataPacket(
            new AddItemActorPacket({
                targetActorId: runtimeEntityId,
                runtimeEntityId,
                item: stack.getItem().toStackDescriptor(context),
                position: item.getPosition(),
                motion: item.getMotion(),
                metadata: item.metadata,
                isFromFishing: false
            })
        );
    }

    /**
     * Takes an entity off this connection.
     * @param {Entity} entity - The entity to remove.
     */
    public async sendRemoveActor(entity: Entity): Promise<void> {
        await this.sendRemoveActorById(entity.getRuntimeId());
    }

    /**
     * Takes an entity off this client by id.
     *
     * By id rather than by entity because the tracker has to be able to hide something that
     * has already left the world - there is no object left to ask. Correct for every kind of
     * entity: `RemoveActorPacket` is what both `Entity.despawnFrom` and `Player.despawnFrom`
     * end up sending, players included.
     * @param {bigint} runtimeId - The entity's runtime id.
     */
    public async sendRemoveActorById(runtimeId: bigint): Promise<void> {
        const packet = new RemoveActorPacket();
        packet.uniqueEntityId = runtimeId; // We use runtime as unique
        await this.send(packet);
    }

    /**
     * Where an entity is, as the packet that says so.
     *
     * The rotation goes with it. Without it every field was left at zero, so a mob walking south
     * faced north the whole way, and a herd of cows all faced the same direction whatever they were
     * doing - which reads as broken however smooth the movement underneath it is.
     *
     * Ordinary movement stays interpolated. A teleport sets the snap flag so a client does not
     * animate the actor across the distance between its old and new positions.
     * @param {Entity} entity - The entity that moved.
     * @param {boolean} teleport - Whether clients should snap to the new position.
     * @returns {MoveActorAbsolutePacket} The packet, not yet sent.
     */
    private static movePacketFor(entity: Entity, teleport = false): MoveActorAbsolutePacket {
        const packet = new MoveActorAbsolutePacket();
        packet.runtimeEntityId = entity.getRuntimeId();
        packet.position = entity.getPosition();

        packet.pitch = entity.pitch;
        packet.yaw = entity.yaw;
        packet.headYaw = entity.headYaw;

        // The on-ground flag, which was hardcoded clear because nothing tracked the state. The
        // data runtime does: a mob is carried through the air only while an impulse is still
        // spending itself, and `coast` ends that by landing it on the first cell it cannot fall
        // into. Everything else reports false and is drawn from the client's own guess, which is
        // what every entity got while the flag was never set.
        packet.flags =
            (entity.isOnGround() ? MoveActorAbsolutePacket.FLAG_ON_GROUND : 0) |
            (teleport ? MoveActorAbsolutePacket.FLAG_TELEPORT : 0);

        return packet;
    }

    /**
     * Tells this connection an entity has moved, on its own.
     *
     * For a move that happens outside the world tick - a teleport, a command. Movement produced by
     * the tick goes through {@link queueMoveActor} instead.
     * @param {Entity} entity - The entity that moved.
     */
    public async sendMoveActor(entity: Entity): Promise<void> {
        await this.send(PlayerSession.movePacketFor(entity));
    }

    /**
     * Adds an entity's movement to this tick's batch.
     *
     * Sending each one on its own is what made mobs move in fits and starts, and for two reasons.
     * Every packet became its own compressed batch and its own RakNet frame, so thirty mobs cost
     * thirty compressions and thirty frames a tick, per player. Worse, `sendDataPacket` queues
     * behind any chunk still compressing - so while a walking player streams terrain, every mob's
     * movement waited behind it and then arrived in a burst. Mobs froze and jumped in exactly the
     * rhythm the chunks were arriving in.
     *
     * One batch a tick fixes both: one compression, one frame, and one place in the queue for the
     * lot of them.
     * @param {Entity} entity - The entity that moved.
     */
    public queueMoveActor(entity: Entity, teleport = false): void {
        // Keyed by entity, so an entity that moved more than once this tick goes out once, at
        // where it ended up. `Entity.setX`, `setY` and `setZ` each announce a move of their
        // own, so a diagonal step produced three identical packets naming the same
        // destination. A `Map` keeps insertion order, so the batch is ordered as before.
        this.queuedMoves.set(Number(entity.getRuntimeId()), PlayerSession.movePacketFor(entity, teleport));
    }

    /**
     * Sends this tick's movement as one batch.
     *
     * Called once per world tick, after every entity has had its update.
     * @returns {Promise<void>} Resolves once the batch has been framed.
     */
    public async flushQueuedMoves(): Promise<void> {
        if (this.queuedMoves.size === 0) return;

        const packets = [...this.queuedMoves.values()];
        this.queuedMoves.clear();

        // Not `direct`: movement is not urgent enough to force a datagram of its own, and letting
        // RakNet coalesce it with whatever else is going out is the point of batching it at all.
        this.connection.sendPackets(packets, { direct: false });
        // The session queue can include other tick traffic; this method still resolves only after
        // the batch holding the movement has been framed.
        await this.connection.flushOutboundPackets();
    }

    /**
     * Spawn the player for another player
     *
     * @param player - the player to send the AddPlayerPacket to
     */
    public async sendSpawn(player: Player): Promise<void> {
        const targetSession = player.getNetworkSession();
        const context = targetSession.getConnection().codec.context;
        const position = this.player.getPosition();
        // `Player.platformChatId` is still empty because the login handler does not read the
        // client's platform online id yet. This sends what the player list sends.
        // Mirrors `sendAbilities`. Without these every player showed up to everybody else as
        // a visitor on an unknown platform.
        const op = this.player.isOp();
        await targetSession.send(
            new AddPlayerPacket({
                uuid: this.player.getUUID(),
                name: this.player.getName(),
                runtimeEntityId: this.player.getRuntimeId(),
                platformChatId: this.player.platformChatId,
                position,
                // Players report their own movement every tick, so the server has no velocity to send.
                motion: new Vector3(0, 0, 0),
                pitch: this.player.pitch,
                yaw: this.player.yaw,
                headYaw: this.player.headYaw,
                carriedItem: this.player.getInventory().getItemInHand().toStackDescriptor(context),
                gamemode: this.player.gamemode,
                metadata: this.player.metadata,
                syncedProperties: new SyncedProperties(),
                abilities: {
                    targetPlayerRawId: this.player.getRuntimeId(),
                    playerPermission: op ? PlayerPermissionLevel.OPERATOR : PlayerPermissionLevel.MEMBER,
                    commandPermission: op ? CommandPermissionLevel.GAME_DIRECTORS : CommandPermissionLevel.ANY,
                    layers: []
                },
                links: [],
                passengerOfBlock: null,
                deviceId: this.player.device?.id ?? '',
                buildPlatform: this.player.device?.os ?? BuildPlatform.UNKNOWN
            })
        );

        // No adventure settings here. This used to call `sendSettings(player)`, which builds
        // the packet from the player passed and sends it to *this* connection - so showing A
        // to B sent B's settings to A. The packet has no target actor and describes only the
        // client receiving it, so it has no place in a spawn at all.
        await targetSession.sendAbilities(this.player);

        // `AddPlayerPacket` carries the held item and nothing else, so armor has to follow the
        // player into view as a packet of its own - otherwise everybody else sees them in their
        // shirtsleeves however well equipped they are.
        await targetSession.sendArmorFor(this.player);
        await targetSession.sendStatusEffects(this.player);
    }

    /**
     * Despawn the player entity from another player
     */
    public async sendDespawn(player: Player): Promise<void> {
        const pk = new RemoveActorPacket();
        pk.uniqueEntityId = this.player.getRuntimeId(); // We use runtime as unique
        await player.getNetworkSession().getConnection().sendDataPacket(pk);
    }

    /** Sends a `PlayStatus` to this player's client. */
    public async sendPlayStatus(status: PlayStatus): Promise<void> {
        await this.connection.sendDataPacket(new PlayStatusPacket({ status }), true);
    }

    public getConnection(): ClientConnection {
        return this.connection;
    }

    public getPlayer(): Player {
        return this.player;
    }
}
