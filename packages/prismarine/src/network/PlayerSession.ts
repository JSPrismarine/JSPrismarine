import { Vector3 } from '@jsprismarine/math';
import { Gametype } from '@jsprismarine/minecraft';
import Heap from 'heap';
import type Player from '../Player';
import type Server from '../Server';
import type { CommandArgument } from '../command/CommandArguments';
import { CommandArgumentEntity, CommandArgumentGamemode } from '../command/CommandArguments';
import type { Attribute, Attributes } from '../entity/Attribute';
import type { Entity } from '../entity/Entity';
import type { Metadata } from '../entity/Metadata';
import type Human from '../entity/Human';
import { Mob } from '../entity/Mob';
import type { Item as ItemEntity } from '../entity/other/Item';
import { Projectile } from '../entity/other/Projectile';
import CreativeInventory from '../inventory/CreativeInventory';
import { WindowIds } from '../inventory/WindowIds';
import { WindowTypes } from '../inventory/WindowTypes';
import type { Item } from '../item/Item';
import BlockPosition from '../world/BlockPosition';
import CoordinateUtils from '../world/CoordinateUtils';
import { effectiveViewDistance, toChunk } from '../world/Proximity';
import Chunk from '../world/chunk/Chunk';
import type ClientConnection from './ClientConnection';
import { EntityTracker } from './EntityTracker';
import type { DataPacket } from './Packets';
import { BatchPacket } from './Packets';
import AddActorPacket from './packet/AddActorPacket';
import AddItemActorPacket from './packet/AddItemActorPacket';
import AddPlayerPacket from './packet/AddPlayerPacket';
import AvailableCommandsPacket from './packet/AvailableCommandsPacket';
import ChunkRadiusUpdatedPacket from './packet/ChunkRadiusUpdatedPacket';
import CraftingDataPacket from './packet/CraftingDataPacket';
import CreativeContentPacket from './packet/CreativeContentPacket';
import ContainerOpenPacket from './packet/ContainerOpenPacket';
import InventoryContentPacket from './packet/InventoryContentPacket';
import InventorySlotPacket from './packet/InventorySlotPacket';
import LevelChunkPacket from './packet/LevelChunkPacket';
import MobArmorEquipmentPacket from './packet/MobArmorEquipmentPacket';
import MobEquipmentPacket from './packet/MobEquipmentPacket';
import MoveActorAbsolutePacket from './packet/MoveActorAbsolutePacket';
import MovePlayerPacket from './packet/MovePlayerPacket';
import type { ChunkCoord } from './packet/NetworkChunkPublisherUpdatePacket';
import NetworkChunkPublisherUpdatePacket from './packet/NetworkChunkPublisherUpdatePacket';
import PlayStatusPacket from './packet/PlayStatusPacket';
import PlayStatusType from './type/PlayStatusType';
import PlayerListPacket, { PlayerListAction, PlayerListEntry } from './packet/PlayerListPacket';
import RemoveActorPacket from './packet/RemoveActorPacket';
import type { RespawnState } from './packet/RespawnPacket';
import RespawnPacket from './packet/RespawnPacket';
import SetActorDataPacket from './packet/SetActorDataPacket';
import SetActorMotionPacket from './packet/SetActorMotionPacket';
import SetPlayerGametypePacket from './packet/SetPlayerGametypePacket';
import SetTimePacket from './packet/SetTimePacket';
import TextPacket from './packet/TextPacket';
import UpdateAbilitiesPacket, {
    AbilityLayer,
    AbilityLayerFlag,
    AbilityLayerType
} from './packet/UpdateAbilitiesPacket';
import UpdateAdventureSettingsPacket from './packet/UpdateAdventureSettingsPacket';
import UpdateAttributesPacket from './packet/UpdateAttributesPacket';
import CommandData from './type/CommandData';
import { CommandEnum } from './type/CommandEnum';
import CommandParameter, { CommandParameterType } from './type/CommandParameter';
import MovementType from './type/MovementType';
import PermissionType from './type/PermissionType';
import PlayerPermissionType from './type/PlayerPermissionType';
import ChunkSender from './ChunkSender';
import TextType from './type/TextType';

/**
 * Chunks per batch, and the reason it is small.
 *
 * A batch goes out as one reliable ordered RakNet message, so the client cannot decompress
 * or render *any* of it until *all* of it has arrived. At fifty chunks a batch is well over
 * a hundred fragments at a 1400 byte MTU, and a single delayed fragment holds up all fifty
 * - which is what the holes lasting seconds were. Raising the CPU budget did nothing
 * because the wait was never CPU.
 *
 * A handful per batch is a few fragments each, so chunks appear as they land. At twenty
 * ticks a second this still carries far more than generation can produce.
 */
const CHUNKS_PER_BATCH = 4;

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
    private readonly queuedMoves: Map<bigint, MoveActorAbsolutePacket> = new Map();

    private readonly chunkSendQueue: Chunk[] = [];

    /** What this player still has to receive, nearest first. Drained by the server's scheduler. */
    private readonly chunkSender = new ChunkSender();
    private readonly loadedChunks: Set<bigint> = new Set();
    private readonly loadingChunks: Set<bigint> = new Set();

    /**
     * Which entities this client currently has on screen.
     *
     * Kept here, beside the chunk state, because it has exactly the same life: it is emptied
     * when the player changes world and it dies with the session, so nothing has to remember
     * to tidy it up.
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
     * Takes this client back out of the chunk rotation. Paired with {@link PlayerSession.enable}
     * and safe to call more than once.
     * @group Lifecycle
     */
    public disable(): void {
        this.server.getChunkScheduler().remove(this);
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
        try {
            await this.requestChunk(x, z);
            if (this.chunkSendQueue.length >= CHUNKS_PER_BATCH) await this.flushChunkBatch();
        } catch (error: unknown) {
            this.loadingChunks.delete(Chunk.packXZ(x, z));
            throw error;
        }
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

            this.loadingChunks.add(hash);
            this.chunkSender.enqueue(x, z);
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
    public async update(_tick: number): Promise<void> {
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

    /** Forgets every tracked entity without telling the client - it is changing worlds. */
    public clearTrackedEntities(): void {
        this.entityTracker.clear();
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
    private async flushChunkBatch(): Promise<void> {
        const chunksToSend = this.chunkSendQueue.splice(0, this.chunkSendQueue.length);
        if (chunksToSend.length === 0) return;

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
        await this.sendNetworkChunkPublisher(effectiveViewDistance(this.player.viewDistance), []);

        const batch = new BatchPacket();
        for (const chunk of chunksToSend) {
            const pk = new LevelChunkPacket();
            pk.chunkX = chunk.getX();
            pk.chunkZ = chunk.getZ();
            pk.clientSubChunkRequestsEnabled = false;
            pk.subChunkCount = chunk.getNetworkSubChunkCount();
            pk.data = chunk.networkSerialize();

            batch.addPacket(pk);
        }

        // Asynchronous: compressing a batch of chunks is the biggest single piece of work on
        // this path, and this is what moves it off the main thread.
        batch.compressionLevel = this.server.getConfig().getPacketCompressionLevel();

        try {
            await this.connection.sendBatchAsync(batch, false);
        } catch (error: unknown) {
            // Nothing reached the client, so nothing may be recorded as loaded. Marking
            // before the send meant a batch that failed to compress left every chunk in it
            // flagged as delivered, and the player kept a hole where they were.
            for (const chunk of chunksToSend) this.loadingChunks.delete(Chunk.packXZ(chunk.getX(), chunk.getZ()));
            throw error;
        }

        // Loaded only once it is actually on the wire.
        for (const chunk of chunksToSend) {
            const hash = Chunk.packXZ(chunk.getX(), chunk.getZ());
            this.loadedChunks.add(hash);
            this.loadingChunks.delete(hash);
        }

        // The spawn status waits for this, not the other way round.
        await this.announceSpawnIfReady();
    }

    /**
     * Sends one packet to this client.
     *
     * Returns the send rather than dropping it: without this, every `await session.send(...)`
     * and every `Promise.all` over a broadcast resolved immediately and any framing error
     * went nowhere.
     * @param {DataPacket} packet - The packet to send.
     */
    public async send(packet: DataPacket): Promise<void> {
        return this.connection.sendDataPacket(packet);
    }

    /**
     * Notify a client about change(s) to the adventure settings.
     *
     * @param player - The client-controlled entity
     */
    public async sendSettings(player?: Player): Promise<void> {
        const target = player ?? this.player;

        const packet = new UpdateAdventureSettingsPacket();
        packet.worldImmutable = target.gamemode === Gametype.SPECTATOR;
        packet.noAttackingPlayers = target.gamemode === Gametype.SPECTATOR;
        packet.noAttackingMobs = target.gamemode === Gametype.SPECTATOR;
        packet.autoJump = true;
        packet.showNameTags = true;
        await this.connection.sendDataPacket(packet);
    }

    public async sendAbilities(player?: Player): Promise<void> {
        const target = player ?? this.player;

        // Read off the gamemode rather than each written out by hand, which is how
        // `INSTABUILD` - the flag that *is* creative, as far as the client is concerned - came
        // to be granted to spectators and withheld from creative players.
        const creative = target.gamemode === Gametype.CREATIVE;
        const spectator = target.gamemode === Gametype.SPECTATOR;

        const mainLayer = new AbilityLayer();
        mainLayer.layerType = AbilityLayerType.BASE;
        mainLayer.layerFlags = new Map([
            [AbilityLayerFlag.FLY_SPEED, true],
            [AbilityLayerFlag.WALK_SPEED, true],
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
            [AbilityLayerFlag.BUILD, !spectator],
            [AbilityLayerFlag.MINE, !spectator],
            [AbilityLayerFlag.DOORS_AND_SWITCHES, !spectator],
            [AbilityLayerFlag.OPEN_CONTAINERS, !spectator],
            [AbilityLayerFlag.ATTACK_PLAYERS, !spectator],
            [AbilityLayerFlag.ATTACK_MOBS, !spectator]
        ]);
        mainLayer.flySpeed = 0.05;
        mainLayer.walkSpeed = 0.1;

        const packet = new UpdateAbilitiesPacket();
        packet.commandPermission = target.isOp() ? PermissionType.Operator : PermissionType.Normal;
        packet.playerPermission = target.isOp() ? PlayerPermissionType.Operator : PlayerPermissionType.Member;
        packet.targetActorUniqueId = target.getRuntimeId();
        packet.abilityLayers = [mainLayer];
        await this.send(packet);
    }

    public async needNewChunks(forceResend = false, dist?: number): Promise<void> {
        const currentXChunk = CoordinateUtils.fromBlockToChunk(this.player.getPosition().getX());
        const currentZChunk = CoordinateUtils.fromBlockToChunk(this.player.getPosition().getZ());

        const viewDistance = this.player.viewDistance || dist || 0;

        const chunksToSendHeap = new Heap((a: number[], b: number[]) => {
            const distXFirst = Math.abs(a[0]! - currentXChunk);
            const distXSecond = Math.abs(b[0]! - currentXChunk);

            const distZFirst = Math.abs(a[1]! - currentZChunk);
            const distZSecond = Math.abs(b[1]! - currentZChunk);

            return distXFirst + distZFirst > distXSecond + distZSecond ? 1 : -1;
        });

        for (let sendXChunk = -viewDistance; sendXChunk <= viewDistance; sendXChunk++) {
            for (let sendZChunk = -viewDistance; sendZChunk <= viewDistance; sendZChunk++) {
                if (sendXChunk * sendXChunk + sendZChunk * sendZChunk > viewDistance * viewDistance) continue; // early exit if chunk is outside of view distance
                const newChunk = [currentXChunk + sendXChunk, currentZChunk + sendZChunk];
                const hash = Chunk.packXZ(newChunk[0]!, newChunk[1]!);

                if (forceResend) {
                    chunksToSendHeap.push(newChunk);
                } else if (!this.loadedChunks.has(hash) && !this.loadingChunks.has(hash)) {
                    chunksToSendHeap.push(newChunk);
                }
            }
        }

        // Queue rather than send. This loop used to run to completion, generating and
        // serialising every chunk in one go - hundreds of milliseconds during which the
        // socket answered nothing and every other player froze. The server's scheduler now
        // drains this a slice at a time, sharing the tick between players.
        const queued: Array<[number, number]> = [];
        while (chunksToSendHeap.size() > 0) {
            const closestChunk = chunksToSendHeap.pop()!;
            const hash = Chunk.packXZ(closestChunk[0]!, closestChunk[1]!);

            // A forced resend has to go out again even though it is already loaded.
            if (forceResend) this.loadedChunks.delete(hash);

            queued.push([closestChunk[0]!, closestChunk[1]!]);
        }

        this.queueChunks(currentXChunk, currentZChunk, queued);

        let unloaded = false;

        for (const hash of this.loadedChunks) {
            const [x, z] = Chunk.unpackXZ(hash);

            if (Math.abs(x! - currentXChunk) > viewDistance || Math.abs(z! - currentZChunk) > viewDistance) {
                unloaded = true;
                this.loadedChunks.delete(hash);
            }
        }

        for (const hash of this.loadingChunks) {
            const [x, z] = Chunk.unpackXZ(hash);

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

    public async requestChunk(x: number, z: number): Promise<void> {
        const chunk = await this.player.getWorld().getChunk(x, z);
        this.chunkSendQueue.push(chunk);
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
        this.loadedChunks.clear();
        this.loadingChunks.clear();
        this.chunkSender.clear();
        this.chunkSendQueue.length = 0;

        // So the next `update` sees a chunk change and asks for terrain again, rather than
        // comparing against where the player stood in the world it just left.
        this.lastChunkX = null;
        this.lastChunkZ = null;
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

        const pk = new InventoryContentPacket();
        pk.items = inventory.getItems(true);
        pk.windowId = windowId;
        await this.connection.sendDataPacket(pk);

        // Through the entry rather than `getItemInHand`, which hands back an empty slot's air
        // as though it were an item and cannot be written out.
        const hand = inventory.getEntry(inventory.getHandSlotIndex());
        if (hand) await this.sendHandItem(hand.toItemStack());

        // The armour container is a window of its own, so the main inventory's contents say
        // nothing about it and a player would open their screen to four empty slots.
        const armor = new InventoryContentPacket();
        armor.items = inventory.getArmor().getItems(true);
        armor.windowId = WindowIds.ARMOR;
        await this.connection.sendDataPacket(armor);

        await this.sendArmorFor(this.player);
    }

    /**
     * Tells the client what one slot of its crafting grid now holds.
     *
     * The grid lives in the player's own UI window rather than in the inventory, and an
     * `ItemStackResponse` can only answer about slots the request named. A craft names none
     * of them - the client sends `CraftingRecipe`, `CraftingResultsDeprecated` and `Take`,
     * and no slot of the grid among them - so this is the only way to say the ingredients
     * have been spent. Without it the log stayed on screen and could be crafted from for
     * ever, while the server had already taken it.
     * @param {number} wireSlot - the slot in the client's numbering, 28 upwards.
     * @param {Item | null} item - what is there now, or `null` to empty it.
     */
    public async sendCraftingSlot(wireSlot: number, item: Item | null): Promise<void> {
        const packet = new InventorySlotPacket();
        packet.windowId = WindowIds.PLAYER_ONLY_UI;
        packet.inventorySlot = wireSlot;
        packet.item = item;

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
        await this.connection.sendDataPacket(packet);

        await this.sendInventory(packet.windowId);
    }

    /**
     * The next window id to open a container under.
     *
     * The range is not invented: `ContainerID` documents where a server's own windows begin
     * and end, and everything outside it is spoken for - zero is the player inventory, and
     * the hundreds are the armour, the offhand and the player-only UI. Wrapping keeps a long
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
     * How many go out is `crafting-recipe-limit` in the config: `0` sends nothing, `-1`
     * sends everything, and it starts at one. See there for why.
     */
    public async sendCraftingData(): Promise<void> {
        const limit = this.server.getConfig().getCraftingRecipeLimit();
        if (limit === 0) return;

        const manager = this.server.getRecipeManager();
        const all = manager.getRecipes();

        const packet = new CraftingDataPacket();
        packet.recipes = limit < 0 ? all : all.slice(0, limit);
        // The net id is the recipe's position in the manager's list, not in what was sent -
        // otherwise trimming the list would renumber what the client refers to.
        packet.netIdOf = (recipe) => manager.getNetId(recipe) ?? 0;

        await this.connection.sendDataPacket(packet);

        this.server
            .getLogger()
            .debug(`Sent §b${packet.recipes.length}§r of §b${all.length}§r recipe(s) to ${this.player.getName()}`);
    }

    public async sendCreativeContents(empty = false): Promise<void> {
        const pk = new CreativeContentPacket();
        if (empty) {
            await this.connection.sendDataPacket(pk);
            return;
        }

        // The same list a creative pick is resolved through, so that the position the client
        // sends back names the entry it was shown.
        pk.items = CreativeInventory.getItems(this.player.getServer());

        await this.connection.sendDataPacket(pk);
    }

    /**
     * Sets the item in the player hand.
     * @param {Item} item - The entity.
     */
    public async sendHandItem(item: Item): Promise<void> {
        const pk = new MobEquipmentPacket();
        pk.runtimeEntityId = this.player.getRuntimeId();
        pk.item = item;
        pk.inventorySlot = this.player.getInventory().getHandSlotIndex();
        pk.hotbarSlot = this.player.getInventory().getHandSlotIndex();
        pk.windowId = 0; // Inventory ID
        await this.connection.sendDataPacket(pk);
    }

    /**
     * Send the current tick to a client.
     * @param {number} tick - The tick
     */
    public async sendTime(tick: number): Promise<void> {
        const pk = new SetTimePacket();
        pk.time = tick;
        await this.connection.sendDataPacket(pk);
    }

    /**
     * Send gamemode to a client.
     * @param {Gametype} gamemode - the numeric gamemode ID.
     */
    public async sendGamemode(gamemode?: Gametype): Promise<void> {
        const packet = new SetPlayerGametypePacket();
        packet.gametype = gamemode ?? this.player.gamemode;
        await this.connection.sendDataPacket(packet);
    }

    public async sendNetworkChunkPublisher(distance: number, savedChunks: ChunkCoord[]): Promise<void> {
        const pk = new NetworkChunkPublisherUpdatePacket();
        pk.position = BlockPosition.fromVector3(this.player.getPosition());
        pk.radius = distance << 4;
        pk.savedChunks = savedChunks;
        await this.connection.sendDataPacket(pk);
    }

    public async sendAvailableCommands(): Promise<void> {
        const playerEnum = new CommandEnum();
        playerEnum.soft = true;
        playerEnum.name = 'Player';
        playerEnum.values = this.player
            .getServer()
            .getSessionManager()
            .getAllPlayers()
            .map((player) => player.getName());

        const pk = new AvailableCommandsPacket();
        pk.softEnums = [playerEnum];
        this.server
            .getCommandManager()
            .getCommandsList()
            .forEach((command) => {
                const commandClass = Array.from(this.server.getCommandManager().getCommands().values()).find(
                    (cmd) => cmd.name === command[0]
                );

                if (!commandClass) {
                    this.player
                        .getServer()
                        .getLogger()
                        .warn(`Can't find corresponding command class for "${command[0]}"`);
                    return;
                }

                if (!this.player.getServer().getPermissionManager().can(this.player).execute(commandClass.permission))
                    return;

                const cmd = new CommandData();
                cmd.commandName = command[0];
                cmd.commandDescription = commandClass.description;
                if (commandClass.aliases!.length > 0) {
                    const cmdAliases = new CommandEnum();
                    cmdAliases.name = `${command[0]}Aliases`;
                    cmdAliases.values = commandClass.aliases!.concat(command[0]);
                    cmd.aliases = cmdAliases;
                }

                command[2].forEach((arg, index) => {
                    const parameters = arg
                        .map((parameter: CommandArgument | null) => {
                            if (!parameter || !(parameter as any)?.getParameters) return [];

                            const parameters = parameter.getParameters(this.server);
                            if (parameters) return Array.from(parameters.values());

                            if (parameter instanceof CommandArgumentEntity)
                                return [
                                    new CommandParameter({
                                        paramName: 'target',
                                        paramType: CommandParameterType.Target
                                    })
                                ];
                            if (parameter instanceof CommandArgumentGamemode)
                                return [
                                    new CommandParameter({
                                        paramName: 'gamemode',
                                        paramType: CommandParameterType.String
                                    })
                                ];
                            if (parameter.constructor.name === 'StringArgumentType')
                                return [
                                    new CommandParameter({
                                        paramName: 'value',
                                        paramType: CommandParameterType.String
                                    })
                                ];
                            if (parameter.constructor.name === 'IntegerArgumentType')
                                return [
                                    new CommandParameter({
                                        paramName: 'number',
                                        paramType: CommandParameterType.Int
                                    })
                                ];

                            this.server.getLogger().warn(`Invalid parameter ${parameter.constructor.name}`);
                            return [
                                new CommandParameter({
                                    paramName: 'value',
                                    paramType: CommandParameterType.String
                                })
                            ];
                        })
                        .flat();
                    cmd.overloads[index] = parameters;
                });
                pk.commandData.push(cmd);
            });

        await this.getConnection().sendDataPacket(pk);
    }

    /**
     * Set the client's maximum view distance.
     *
     * @param distance - The view distance
     */
    public async setViewDistance(distance: number): Promise<void> {
        const packet = new ChunkRadiusUpdatedPacket();
        packet.radius = this.player.viewDistance = distance;
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
        await this.sendPlayStatus(PlayStatusType.PlayerSpawn);
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
        packet.tick = BigInt(this.player.getServer().getTick());
        await this.connection.sendDataPacket(packet);
    }

    /**
     * Hand the client a velocity and let it move the player itself.
     *
     * The only way to shove a player. Their position is theirs - the server stores what it is
     * told - so setting it from here is overruled by the next movement packet and read as
     * rubber-banding. A velocity is a request the client is happy to honour.
     * @param {Vector3} motion - Blocks per tick, in each axis.
     */
    public async sendMotion(motion: Vector3): Promise<void> {
        const packet = new SetActorMotionPacket();
        packet.runtimeEntityId = this.player.getRuntimeId();
        packet.motion = motion;
        packet.tick = BigInt(this.player.getServer().getTick());
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
        packet.tick = BigInt(this.player.getServer().getTick());
        await this.connection.sendDataPacket(packet);
    }

    /**
     * Tells the client it may put its dead player back into the world, and where.
     * @param {Vector3} position - Where the player comes back.
     */
    /**
     * One of the server's two halves of the respawn exchange.
     *
     * The order matters and is not obvious. `SERVER_SEARCHING_FOR_SPAWN` goes out the moment
     * the player dies, carrying where they will reappear; the client then shows its death
     * screen. `SERVER_READY_TO_SPAWN` is the *answer* to the client saying it has finished
     * loading, and goes out only then.
     *
     * Sending the second in place of the first leaves the client on "Respawning" for ever:
     * it is waiting to be told where it will come back before it will even offer the button.
     * @param {Vector3} position - Where the player will reappear.
     * @param {RespawnState} state - Which half of the exchange this is.
     * @see https://github.com/pmmp/PocketMine-MP/blob/stable/src/network/mcpe/handler/DeathPacketHandler.php
     */
    public async sendRespawn(position: Vector3, state: RespawnState): Promise<void> {
        const packet = new RespawnPacket();
        packet.runtimeEntityId = this.player.getRuntimeId();
        packet.position = position;
        packet.state = state;
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
     * @param {TextType} [options.type=TextType.Raw] - The type of the message.
     * @returns {Promise<void>} A promise that resolves when the message is sent.
     */
    public async sendMessage({
        message,
        sourceName = '',
        xuid = '',
        platformChatId = '',
        parameters = [],
        needsTranslation = false,
        type = TextType.Raw
    }: {
        message: string;
        sourceName?: string;
        xuid?: string;
        platformChatId?: string;
        parameters?: string[];
        needsTranslation?: boolean;
        type?: TextType;
    }): Promise<void> {
        if (!message) throw new Error('A message is required');

        const pk = new TextPacket();
        pk.message = message;
        pk.filtered = message;
        pk.sourceName = sourceName;
        pk.xuid = xuid;
        pk.platformChatId = platformChatId;
        pk.parameters = parameters;
        pk.needsTranslation = needsTranslation;
        pk.type = type;
        await this.connection.sendDataPacket(pk);
    }

    /**
     * Sends one player's movement to this client.
     *
     * Named for what it does. It was `broadcastMove`, which reads as a fan-out and is not
     * one - the fan-out is `World.broadcastMove`, and having both made it easy to write the
     * wrong one.
     * @param {Player} player - The player that moved.
     * @param {MovementType} [mode=MovementType.Normal] - What produced the movement.
     */
    public async sendMove(player: Player, mode = MovementType.Normal): Promise<void> {
        const packet = new MovePlayerPacket();
        packet.runtimeEntityId = player.getRuntimeId();

        packet.position = player.getPosition();
        packet.pitch = player.pitch;
        packet.yaw = player.yaw;
        packet.headYaw = player.headYaw;

        packet.mode = mode;

        packet.onGround = player.isOnGround();

        // TODO
        if (mode === MovementType.Teleport) {
            packet.teleportCause = 0;
            packet.teleportItemId = 0;
        }

        packet.ridingEntityRuntimeId = BigInt(0);
        packet.tick = BigInt(this.player.getServer().getTick());
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
        packet.motion = entity instanceof Projectile ? entity.getVelocity() : new Vector3(0, 0, 0);
        packet.pitch = entity.pitch;
        packet.yaw = entity.yaw;
        packet.headYaw = entity.headYaw;
        packet.metadata = entity.metadata;
        // Health, speed and reach arrive with the entity rather than in a packet of their
        // own afterwards, which is the difference between a mob that is right from its first
        // frame and one that is briefly a default.
        packet.attributes = entity.attributes.getAttributes();
        await this.send(packet);

        // What it is holding, if anything. `AddActorPacket` has no room for equipment, so a mob's
        // weapon has to follow it as a packet of its own - and without this a skeleton fires
        // arrows from an empty fist.
        const held = entity instanceof Mob ? entity.getHeldItem() : null;
        if (held) await this.sendHeldItemFor(entity, held);
    }

    /**
     * Tells this client what a human is wearing.
     *
     * All four pieces at once, empty ones included as air: the packet is positional and a client
     * that was sent three would read the next packet's bytes as the fourth.
     * @param {Human} wearer - Whose armour it is.
     */
    public async sendArmorFor(wearer: Human): Promise<void> {
        const armor = wearer.getInventory().getArmor();
        const offhand = wearer.getInventory().getOffhand();

        const packet = new MobArmorEquipmentPacket();
        packet.runtimeEntityId = wearer.getRuntimeId();
        packet.head = armor.getItem(0);
        packet.chest = armor.getItem(1);
        packet.legs = armor.getItem(2);
        packet.feet = armor.getItem(3);
        packet.body = offhand.getItem(0);

        await this.send(packet);
    }

    /**
     * Tells this client what another entity is holding.
     * @param {Entity} entity - Whose hand it is in.
     * @param {Item} item - What they are holding.
     */
    public async sendHeldItemFor(entity: Entity, item: Item): Promise<void> {
        const packet = new MobEquipmentPacket();
        packet.runtimeEntityId = entity.getRuntimeId();
        packet.item = item;

        // A mob has no inventory to name a slot in; vanilla sends zero for both.
        packet.inventorySlot = 0;
        packet.hotbarSlot = 0;
        packet.windowId = 0;

        await this.send(packet);
    }

    /**
     * Writes a dropped item onto this connection.
     * @param {Item} item - The item entity to show.
     */
    public async sendAddItemActor(item: ItemEntity): Promise<void> {
        const stack = item.getItem();
        if (!stack) return;

        const packet = new AddItemActorPacket();
        packet.runtimeEntityId = item.getRuntimeId();
        packet.position = item.getPosition();
        packet.item = stack.getItem();
        // The packet writes this unconditionally, so leaving it unset threw on the first
        // dropped item rather than at the point the field was forgotten.
        packet.metadata = item.metadata;
        await this.connection.sendDataPacket(packet);
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
     * The teleport flag is deliberately not set. A client interpolates an ordinary move over the
     * ticks until the next one and snaps to a teleport, so setting it on a mob that is simply
     * walking is exactly what turns smooth movement into a stutter.
     * @param {Entity} entity - The entity that moved.
     * @returns {MoveActorAbsolutePacket} The packet, not yet sent.
     */
    private static movePacketFor(entity: Entity): MoveActorAbsolutePacket {
        const packet = new MoveActorAbsolutePacket();
        packet.runtimeEntityId = entity.getRuntimeId();
        packet.position = entity.getPosition();

        packet.pitch = entity.pitch;
        packet.yaw = entity.yaw;
        packet.headYaw = entity.headYaw;

        packet.flags = entity instanceof Mob && entity.isOnGround() ? MoveActorAbsolutePacket.FLAG_ON_GROUND : 0;

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
    public queueMoveActor(entity: Entity): void {
        // Keyed by entity, so an entity that moved more than once this tick goes out once, at
        // where it ended up. `Entity.setX`, `setY` and `setZ` each announce a move of their
        // own, so a diagonal step produced three identical packets naming the same
        // destination. A `Map` keeps insertion order, so the batch is ordered as before.
        this.queuedMoves.set(entity.getRuntimeId(), PlayerSession.movePacketFor(entity));
    }

    /**
     * Sends this tick's movement as one batch.
     *
     * Called once per world tick, after every entity has had its update.
     * @returns {Promise<void>} Resolves once the batch has been framed.
     */
    public async flushQueuedMoves(): Promise<void> {
        if (this.queuedMoves.size === 0) return;

        const batch = new BatchPacket();
        for (const packet of this.queuedMoves.values()) batch.addPacket(packet);
        this.queuedMoves.clear();

        // Not `direct`: movement is not urgent enough to force a datagram of its own, and letting
        // RakNet coalesce it with whatever else is going out is the point of batching it at all.
        this.connection.sendBatch(batch, false);
    }

    /**
     * Spawn the player for another player
     *
     * @param player - the player to send the AddPlayerPacket to
     */
    public async sendSpawn(player: Player): Promise<void> {
        const pk = new AddPlayerPacket();
        pk.uuid = this.player.getUUID();
        pk.runtimeEntityId = this.player.getRuntimeId();
        pk.name = this.player.getName();

        const position = this.player.getPosition();
        pk.positionX = position.getX();
        pk.positionY = position.getY();
        pk.positionZ = position.getZ();

        // TODO: motion
        pk.motionX = 0;
        pk.motionY = 0;
        pk.motionZ = 0;

        pk.pitch = this.player.pitch;
        pk.yaw = this.player.yaw;
        pk.headYaw = this.player.headYaw;

        pk.gamemode = this.player.gamemode;
        pk.item = this.player.getInventory().getItemInHand();

        pk.deviceId = this.player.device?.id ?? '';
        pk.metadata = this.player.metadata;

        await player.getNetworkSession().send(pk);

        // No adventure settings here. This used to call `sendSettings(player)`, which builds
        // the packet from the player passed and sends it to *this* connection - so showing A
        // to B sent B's settings to A. The packet has no target actor and describes only the
        // client receiving it, so it has no place in a spawn at all.
        await player.getNetworkSession().sendAbilities(this.player);

        // `AddPlayerPacket` carries the held item and nothing else, so armour has to follow the
        // player into view as a packet of its own - otherwise everybody else sees them in their
        // shirtsleeves however well equipped they are.
        await player.getNetworkSession().sendArmorFor(this.player);
    }

    /**
     * Despawn the player entity from another player
     */
    public async sendDespawn(player: Player): Promise<void> {
        const pk = new RemoveActorPacket();
        pk.uniqueEntityId = this.player.getRuntimeId(); // We use runtime as unique
        await player.getNetworkSession().getConnection().sendDataPacket(pk);
    }

    public async sendPlayStatus(status: number): Promise<void> {
        const pk = new PlayStatusPacket();
        pk.status = status;
        await this.connection.sendDataPacket(pk, true);
    }

    public getConnection(): ClientConnection {
        return this.connection;
    }

    public getPlayer(): Player {
        return this.player;
    }
}
