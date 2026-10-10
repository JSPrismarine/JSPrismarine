import type { Vector3 } from '@jsprismarine/math';
import type { LevelEvent, LevelSoundEvent } from '@jsprismarine/minecraft';
import { LevelSoundEvent as SoundEvent } from '@jsprismarine/minecraft';
import Player from '../Player';
import type Server from '../Server';
import type { Attribute } from '../entity/Attribute';
import type { Entity } from '../entity/Entity';
import { Position } from '../world/Position';
import { isInView, SOUND_RADIUS, WORLD_EVENT_RADIUS } from '../world/Proximity';
import type { AudienceOptions, World } from '../world/World';
import type { WorldChangeSink } from '../world/WorldChangeSink';
import type { DataPacket } from './Packets';
import { BatchPacket } from './Packets';
import type { ActorEvent } from './packet/ActorEventPacket';
import ActorEventPacket from './packet/ActorEventPacket';
import LevelSoundEventPacket from './packet/LevelSoundEventPacket';
import UpdateBlockPacket from './packet/UpdateBlockPacket';
import WorldEventPacket from './packet/WorldEventPacket';

/**
 * The actor type a sound is attributed to, where vanilla sends something other than nothing.
 *
 * Protocol trivia, and the reason it lives here rather than in the world: a break carries a
 * bare `':'` and a place carries an empty string, which is a fact about the wire format and
 * about nothing else.
 */
const SOUND_ACTOR_TYPE: Partial<Record<LevelSoundEvent, string>> = {
    [SoundEvent.BREAK]: ':'
};

/** A block change waiting for the end of the tick. */
interface BlockChange {
    position: Vector3;
    blockRuntimeId: number;
}

/**
 * What a batch of block changes is called in the traffic log.
 *
 * `sendSharedBatch` takes already-encoded bytes and a packet purely to name them; the batch holds
 * many, so one stands for all of them. Never encoded, never sent - only its type name is read.
 */
const BLOCK_BATCH_LABEL = new UpdateBlockPacket();

/**
 * Turns what happened in one world into packets, and decides who gets them.
 *
 * The whole of the network's knowledge of a world lives here. It is the other half of
 * {@link WorldChangeSink}: the world says "a block changed there", this works out which
 * clients are near enough to care, builds the packet once and puts it on their connections.
 *
 * Before this, the world did all of it - it built `UpdateBlockPacket`s, reached through
 * players into their sessions and into their connections, and ran the shared-batch
 * compression itself.
 */
export class NetworkWorldReplicator implements WorldChangeSink {
    /**
     * Block changes made since the last flush, keyed by position.
     *
     * The map is the deduplication: physics rewrites the same position several times while a flow
     * settles, and only where it ended up is worth a packet.
     */
    private readonly pendingBlocks = new Map<string, BlockChange>();

    public constructor(
        private readonly world: World,
        private readonly server: Server
    ) {}

    /**
     * Everyone in this world who should be told about something that happened at `position`.
     *
     * The single answer to "who receives this". Every positional broadcast goes through here,
     * so there is one place that decides and one place to change - before this, each call site
     * picked its own collection and several of them reached across worlds.
     * @param {Vector3 | null} position - Where it happened; `null` means the whole world.
     * @param {AudienceOptions} [options] - Narrowing.
     * @returns {Player[]} The recipients: online, in this world, near enough.
     */
    public getViewers(position: Vector3 | null, options?: AudienceOptions): Player[] {
        const excluded = options?.exclude;
        const isExcluded = Array.isArray(excluded)
            ? (player: Player) => excluded.includes(player)
            : (player: Player) => player === excluded;

        const candidates = excluded
            ? this.world.getPlayers().filter((player) => !isExcluded(player))
            : this.world.getPlayers();

        if (position === null || !this.server.getConfig().getProximityBroadcast()) return candidates;

        // A position carries the world it belongs to, so a caller that built one somewhere
        // else is asking the wrong world. Cheap guard against the class of bug where block
        // placement fanned out across every world on the server.
        if (position instanceof Position && position.getWorld() !== this.world) {
            this.server
                .getLogger()
                .verbose(`Refusing to broadcast into §b${this.world.getName()}§r for a position in another world`);
            return [];
        }

        return candidates.filter((player) =>
            isInView({
                event: position,
                viewer: player.getPosition(),
                viewDistance: player.viewDistance,
                radius: options?.radius
            })
        );
    }

    /**
     * Sends a packet to every player in this world, however far away they are.
     * @param {DataPacket} packet - The packet to send.
     * @param {object} [options] - Recipients to leave out.
     */
    public send<T extends DataPacket>(packet: T, options?: Pick<AudienceOptions, 'exclude'>): void {
        this.sendToAll(this.getViewers(null, options), packet);
    }

    /**
     * Sends a packet to the players near `position`.
     * @param {Vector3} position - Where it happened.
     * @param {DataPacket} packet - The packet to send.
     * @param {AudienceOptions} [options] - A tighter radius, or recipients to leave out.
     */
    public sendAround<T extends DataPacket>(position: Vector3, packet: T, options?: AudienceOptions): void {
        this.sendToAll(this.getViewers(position, options), packet);
    }

    /** @inheritdoc */
    public blockChanged(position: Vector3, blockRuntimeId: number): void {
        // Keyed by position, so a block written twice within a tick - which liquid physics does
        // constantly, and a cascade of falling sand does by nature - travels once, as whatever it
        // finally settled on.
        this.pendingBlocks.set(`${position.getX()},${position.getY()},${position.getZ()}`, {
            position,
            blockRuntimeId
        });
    }

    /**
     * @inheritdoc
     *
     * One deflate per recipient rather than one per block. An ocean draining into a cavern changes
     * a few thousand blocks in a tick, and each of those used to be its own `BatchPacket` and its
     * own synchronous zlib pass on the tick thread - which is most of what the tick was doing.
     * Twenty bytes of block update also compress far better in company than alone.
     */
    public async flushBlockChanges(): Promise<void> {
        if (this.pendingBlocks.size === 0) return;

        const changes = [...this.pendingBlocks.values()];
        this.pendingBlocks.clear();

        const players = this.world.getPlayers();
        if (players.length === 0) return;

        // With proximity off every client is told about everything, so the bytes are identical and
        // one compression serves them all.
        if (!this.server.getConfig().getProximityBroadcast()) {
            const content = this.compressBlockChanges(changes);
            if (!content) return;

            for (const player of players) {
                player.getNetworkSession().getConnection().sendSharedBatch(content, BLOCK_BATCH_LABEL);
            }

            return;
        }

        for (const player of players) {
            const viewer = player.getPosition();
            const visible = changes.filter((change) =>
                isInView({ event: change.position, viewer, viewDistance: player.viewDistance })
            );

            const content = this.compressBlockChanges(visible);
            if (!content) continue;

            player.getNetworkSession().getConnection().sendSharedBatch(content, BLOCK_BATCH_LABEL);
        }
    }

    /**
     * The finished bytes for a set of block changes, or null if there are none to send.
     * @param {BlockChange[]} changes - What to put in the batch.
     * @returns {Buffer | null} The encoded, compressed batch.
     */
    private compressBlockChanges(changes: readonly BlockChange[]): Buffer | null {
        if (changes.length === 0) return null;

        const batch = new BatchPacket();
        batch.compressionLevel = this.server.getConfig().getPacketCompressionLevel();

        try {
            for (const { position, blockRuntimeId } of changes) {
                const packet = new UpdateBlockPacket();
                packet.x = position.getX();
                packet.y = position.getY();
                packet.z = position.getZ();
                packet.blockRuntimeId = blockRuntimeId;

                batch.addPacket(packet);
            }

            batch.encode();
        } catch (error: unknown) {
            this.server.getLogger().error(error);
            return null;
        }

        return batch.getBuffer();
    }

    /** @inheritdoc */
    public blockSound(position: Vector3, sound: LevelSoundEvent, blockRuntimeId: number): void {
        const packet = new LevelSoundEventPacket();
        packet.sound = sound;

        // Centre of the block, not its corner: the sound is placed in the world and a whole
        // block off is audible when it is right next to you. Only the packet is centred - the
        // audience is still resolved at the block itself, which is the position the world
        // named and the one that still carries which world it is in.
        packet.positionX = position.getX() + 0.5;
        packet.positionY = position.getY() + 0.5;
        packet.positionZ = position.getZ() + 0.5;

        packet.extraData = blockRuntimeId; // In this case refers to block runtime Id
        packet.entityType = SOUND_ACTOR_TYPE[sound] ?? '';
        packet.isBabyMob = false;
        packet.disableRelativeVolume = false;

        this.sendAround(position, packet, { radius: SOUND_RADIUS });
    }

    /** @inheritdoc */
    public actorSound(entity: Entity, sound: LevelSoundEvent): void {
        const position = entity.getPosition();

        const packet = new LevelSoundEventPacket();
        packet.sound = sound;
        packet.positionX = position.getX();
        packet.positionY = position.getY();
        packet.positionZ = position.getZ();

        // Not a block runtime id here - for an actor sound the extra data is a pitch adjustment,
        // and -1 means "whatever this mob's own sound is". A zero would be read as a block.
        packet.extraData = -1;

        // Which mob is making it, so the client picks the zombie's grunt rather than a generic
        // thud. A player is deliberately the empty string: the client uses its own player sounds,
        // and naming `minecraft:player` here plays them twice.
        packet.entityType = entity instanceof Player ? '' : entity.getType();
        packet.isBabyMob = false;
        packet.disableRelativeVolume = false;

        this.sendAround(position, packet, { radius: SOUND_RADIUS });
    }

    /** @inheritdoc */
    public worldEffect(position: Vector3 | null, effect: LevelEvent, data: number): void {
        const packet = new WorldEventPacket();
        packet.eventId = effect;
        // Without this every event played at the world origin: the sound arrived with no
        // direction to it and the particles were nowhere near the block.
        packet.position = position;
        packet.data = data;

        if (position === null) {
            this.send(packet);
            return;
        }

        this.sendAround(position, packet, { radius: WORLD_EVENT_RADIUS });
    }

    /** @inheritdoc */
    public async actorEffect(entity: Entity, effect: ActorEvent, data: number): Promise<void> {
        const packet = new ActorEventPacket();
        packet.runtimeEntityId = entity.getRuntimeId();
        packet.event = effect;
        packet.data = data;

        // To whoever actually has the entity on screen. The packet names a runtime id, and a
        // client that was never sent a spawn for it has nothing to play the animation on.
        await Promise.all(
            this.world
                .getPlayers()
                .filter((player) => player.getNetworkSession().tracks(entity.getRuntimeId()))
                .map(async (player) => player.getNetworkSession().send(packet))
        );
    }

    /** @inheritdoc */
    public async entityAttributesChanged(entity: Entity, attributes: Attribute[]): Promise<void> {
        const runtimeId = entity.getRuntimeId();

        // Gated on tracking for the same reason `actorEffect` is: the packet names a runtime id,
        // and a client that was never sent a spawn for it has nothing to apply the numbers to.
        await Promise.all(
            this.world
                .getPlayers()
                .filter((player) => player.getNetworkSession().tracks(runtimeId))
                .map(async (player) => player.getNetworkSession().sendAttributesFor(entity, attributes))
        );
    }

    /** @inheritdoc */
    public async entityMetadataChanged(entity: Entity): Promise<void> {
        const runtimeId = entity.getRuntimeId();

        await Promise.all(
            this.world
                .getPlayers()
                .filter((player) => player.getNetworkSession().tracks(runtimeId))
                .map(async (player) => player.getNetworkSession().sendMetadataFor(entity))
        );
    }

    /** @inheritdoc */
    public async entityAdded(entity: Entity): Promise<void> {
        if (entity instanceof Player) {
            // Everything already here, shown to the arriving player. Itself excluded by the
            // tracker, since a client is never sent a spawn for the entity it is controlling.
            await entity.getNetworkSession().reconcileTrackedEntities(this.world.getEntities());
        }

        // And the arriving entity offered to everyone already here. This used to return early
        // for a player, so an arriving player was shown the world but the world was never
        // shown them - which is why the resource pack handler needed a pairwise loop of its
        // own across every player on the server.
        await Promise.all(
            this.world
                .getPlayers()
                .filter((player) => player !== entity)
                .map(async (player) => player.getNetworkSession().considerEntity(entity))
        );
    }

    /** @inheritdoc */
    public async entityRemoved(entity: Entity): Promise<void> {
        // Through the tracker rather than `despawnFrom`, so only the clients that were
        // actually shown this entity are told to take it away, and so every client forgets it
        // either way - a stale id left behind would block it from ever being tracked again.
        await Promise.all(this.world.getPlayers().map(async (player) => player.getNetworkSession().dropEntity(entity)));
    }

    /** @inheritdoc */
    public entityMoved(entity: Entity): void {
        // Only to the clients that have this entity. A move for a runtime id a client was
        // never sent a spawn for is discarded at the other end, so tracking is both the
        // correct gate and the cheaper one - a set lookup instead of any distance arithmetic
        // on the hottest path in the server.
        const runtimeId = entity.getRuntimeId();
        for (const player of this.world.getPlayers()) {
            const session = player.getNetworkSession();
            if (session.tracks(runtimeId)) session.queueMoveActor(entity);
        }
    }

    /** @inheritdoc */
    public async timeChanged(ticks: number): Promise<void> {
        // Try to send it at the same time to all
        await Promise.all(this.world.getPlayers().map((player) => player.getNetworkSession().sendTime(ticks)));
    }

    /** @inheritdoc */
    public async reconcile(entities: Entity[]): Promise<void> {
        await Promise.all(
            this.world.getPlayers().map(async (player) => player.getNetworkSession().reconcileTrackedEntities(entities))
        );
    }

    /** @inheritdoc */
    public async flushMovement(): Promise<void> {
        await Promise.all(this.world.getPlayers().map(async (player) => player.getNetworkSession().flushQueuedMoves()));
    }

    /**
     * Puts one packet on several connections, compressing it once.
     *
     * Every recipient gets the same bytes, so they are produced once and framed as many times
     * as there are recipients - a block update to twenty players used to be twenty separate
     * `BatchPacket`s and twenty runs of zlib over identical input.
     *
     * The buffer is safe to share: `getBuffer()` returns a fresh copy on the write path,
     * RakNet only reads it, and fragmentation takes read-only slices of it.
     * @param {Player[]} audience - Who receives it.
     * @param {DataPacket} packet - The packet to send.
     */
    private sendToAll<T extends DataPacket>(audience: Player[], packet: T): void {
        if (audience.length === 0) return;

        // One recipient is the common case for anything happening near a single player, and
        // the ordinary path already does exactly this.
        if (audience.length === 1) {
            void audience[0]!.getNetworkSession().send(packet);
            return;
        }

        const batch = new BatchPacket();
        try {
            batch.addPacket(packet);
            batch.compressionLevel = this.server.getConfig().getPacketCompressionLevel();
            batch.encode();
        } catch (error: unknown) {
            this.server.getLogger().error(error);
            return;
        }

        const content = batch.getBuffer();
        for (const player of audience) {
            player.getNetworkSession().getConnection().sendSharedBatch(content, packet);
        }
    }
}

/**
 * The replicator for each world, built on first use.
 *
 * Network-side membership, deliberately: a world does not keep a list of the clients watching
 * it, it keeps the players in it. Which of those has a connection, and what that connection
 * has been told, is the network layer's own bookkeeping.
 */
export class WorldReplicators {
    private readonly byWorld = new WeakMap<World, NetworkWorldReplicator>();

    public constructor(private readonly server: Server) {}

    /**
     * The replicator for one world.
     * @param {World} world - The world.
     * @returns {NetworkWorldReplicator} Its replicator, created on first request.
     */
    public for(world: World): NetworkWorldReplicator {
        const existing = this.byWorld.get(world);
        if (existing) return existing;

        const replicator = new NetworkWorldReplicator(world, this.server);
        this.byWorld.set(world, replicator);
        return replicator;
    }
}
