import type { Vector3 } from '@jsprismarine/math';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import type { ProtocolCodec } from '@jsprismarine/protocol';
import type { LevelEvent, LevelSoundEvent } from '@jsprismarine/minecraft';
import { LevelSoundEvent as SoundEvent } from '@jsprismarine/minecraft';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import Player from '../Player';
import type Server from '../Server';
import type { Attribute } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { StatusEffect, StatusEffectChange } from '../entity/StatusEffect';
import type { Entity } from '../entity/Entity';
import { toNetworkGameRule } from '../world/GameRuleManager';
import { Position } from '../world/Position';
import { bedrockMobEffectId } from '../entity/StatusEffect';
import { Item } from '../item/Item';
import { WindowIds } from '../inventory/WindowIds';
import {
    effectiveViewDistance,
    isInView,
    SOUND_RADIUS,
    toChunk,
    VIEW_MARGIN_CHUNKS,
    WORLD_EVENT_RADIUS
} from '../world/Proximity';
import type { AudienceOptions, World } from '../world/World';
import type { WorldChange } from '../world/WorldChange';
import type { NamedSoundOptions, WorldChangeSink } from '../world/WorldChangeSink';
import { broadcastSharedBatches } from './MinecraftSession';
import type ClientConnection from './ClientConnection';
import { encodePacketBatchFromBuffersBySize, encodePacketsForCodec, FullFlushFragmentCache } from './encodePacketBatch';
import type { EncodedPacketBatch } from './encodePacketBatch';
import type { ActorEvent } from '@jsprismarine/protocol/packet/ActorEventPacket';
import ActorEventPacket from '@jsprismarine/protocol/packet/ActorEventPacket';
import BlockActorDataPacket from '@jsprismarine/protocol/packet/BlockActorDataPacket';
import BlockPos from '@jsprismarine/protocol/structure/BlockPos';
import LevelSoundEventPacket from '@jsprismarine/protocol/packet/LevelSoundEventPacket';
import UpdateBlockPacket, { UpdateBlockFlagsType } from '@jsprismarine/protocol/packet/UpdateBlockPacket';
import UpdateSubChunkBlocksPacket from '@jsprismarine/protocol/packet/UpdateSubChunkBlocksPacket';
import UpdateSubChunkNetworkBlockInfo from '@jsprismarine/protocol/structure/UpdateSubChunkNetworkBlockInfo';
import Vec3 from '@jsprismarine/protocol/structure/Vec3';
import LevelEventPacket from '@jsprismarine/protocol/packet/LevelEventPacket';
import PlaySoundPacket from '@jsprismarine/protocol/packet/PlaySoundPacket';
import SpawnParticleEffectPacket from '@jsprismarine/protocol/packet/SpawnParticleEffectPacket';
import MoveActorAbsolutePacket from '@jsprismarine/protocol/packet/MoveActorAbsolutePacket';
import UpdateAttributesPacket from '@jsprismarine/protocol/packet/UpdateAttributesPacket';
import SetActorDataPacket from '@jsprismarine/protocol/packet/SetActorDataPacket';
import MobEffectPacket, { MobEffectEvent } from '@jsprismarine/protocol/packet/MobEffectPacket';
import MobArmorEquipmentPacket from '@jsprismarine/protocol/packet/MobArmorEquipmentPacket';
import MobEquipmentPacket from '@jsprismarine/protocol/packet/MobEquipmentPacket';

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

/** A packet grouped for the wire, with a stable identity for this flush's encoding cache. */
interface BlockPacket {
    readonly key: string;
    readonly packet: NetworkPacket<unknown>;
}

/** A block entity change waiting for the end of the tick. */
interface BlockEntityChange {
    position: Vector3;
    tags: NBTTagCompound;
}

/** The pending-map key for a position, which is what makes the last write to it win. */
const positionKey = (position: Vector3): string => `${position.getX()},${position.getY()},${position.getZ()}`;

/** Builds the actor pose packet once, before the move is fanned out to tracking sessions. */
const movePacketFor = (entity: Entity, teleport: boolean): MoveActorAbsolutePacket => {
    const packet = new MoveActorAbsolutePacket();
    packet.runtimeEntityId = entity.getRuntimeId();
    packet.position = entity.getPosition();
    packet.pitch = entity.pitch;
    packet.yaw = entity.yaw;
    packet.headYaw = entity.headYaw;
    packet.flags =
        (entity.isOnGround() ? MoveActorAbsolutePacket.FLAG_ON_GROUND : 0) |
        (teleport ? MoveActorAbsolutePacket.FLAG_TELEPORT : 0);
    return packet;
};

/**
 * How the client applies a block change: as network-authored, with the neighboring visuals
 * recalculated, which is what Bedrock Dedicated Server's own block updates carry.
 */
const BLOCK_UPDATE_FLAGS = UpdateBlockFlagsType.Neighbors | UpdateBlockFlagsType.Network;

/** How many blocks a sub chunk spans on each axis. */
const SUB_CHUNK_SIZE = 16;

/** Which sub chunk a position is in, for grouping a tick's changes. */
const subChunkKey = (position: Vector3): string =>
    `${toChunk(position.getX())},${Math.floor(position.getY() / SUB_CHUNK_SIZE)},${toChunk(position.getZ())}`;

/** The origin corner of the sub chunk a position is in, which the packet names it by. */
const subChunkOrigin = (position: Vector3): BlockPos =>
    new BlockPos(
        toChunk(position.getX()) * SUB_CHUNK_SIZE,
        Math.floor(position.getY() / SUB_CHUNK_SIZE) * SUB_CHUNK_SIZE,
        toChunk(position.getZ()) * SUB_CHUNK_SIZE
    );

/** Identifies a change including the fixed flags carried by its wire packet. */
const blockChangeKey = ({ position, blockRuntimeId }: BlockChange): string =>
    `${position.getX()},${position.getY()},${position.getZ()},${blockRuntimeId >>> 0},${BLOCK_UPDATE_FLAGS}`;

/** The single-block update, which is shorter than a sub chunk packet holding one change. */
const updateBlockPacket = ({ position, blockRuntimeId }: BlockChange): UpdateBlockPacket => {
    const packet = new UpdateBlockPacket();
    packet.x = position.getX();
    packet.y = position.getY();
    packet.z = position.getZ();
    packet.blockRuntimeId = blockRuntimeId;
    packet.flags = BLOCK_UPDATE_FLAGS;
    return packet;
};

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

    /**
     * Block entity changes made since the last flush, keyed by position.
     *
     * Keyed for the same reason {@link pendingBlocks} is, and with more to gain from it: a
     * block entity update carries the whole compound rather than a block's four bytes, so a
     * chest written twice in a tick is two copies of its 27 slots if nothing collapses them.
     */
    private readonly pendingBlockEntities = new Map<string, BlockEntityChange>();

    /** Last pose for each actor that moved since the world's previous movement flush. */
    private readonly pendingMoves = new Map<number, MoveActorAbsolutePacket>();

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
     * @param packet - The packet to send.
     * @param {object} [options] - Recipients to leave out.
     */
    public send<T extends NetworkPacket<unknown>>(packet: T, options?: Pick<AudienceOptions, 'exclude'>): void {
        this.sendToAll(this.getViewers(null, options), packet);
    }

    /**
     * Sends a packet to the players near `position`.
     * @param {Vector3} position - Where it happened.
     * @param packet - The packet to send.
     * @param {AudienceOptions} [options] - A tighter radius, or recipients to leave out.
     */
    public sendAround<T extends NetworkPacket<unknown>>(position: Vector3, packet: T, options?: AudienceOptions): void {
        this.sendToAll(this.getViewers(position, options), packet);
    }

    /** @inheritdoc */
    public worldChanged(change: WorldChange): void {
        switch (change.kind) {
            case 'block-set':
                // Keyed by position, so a block written twice within a tick - which liquid
                // physics does constantly, and a cascade of falling sand does by nature -
                // travels once, as whatever it finally settled on.
                this.pendingBlocks.set(positionKey(change.position), {
                    position: change.position,
                    blockRuntimeId: change.blockRuntimeId
                });
                return;
            case 'block-entity-set':
                this.pendingBlockEntities.set(positionKey(change.position), {
                    position: change.position,
                    tags: change.tags
                });
        }
    }

    /**
     * @inheritdoc
     *
     * One deflate per protocol version rather than one per block. An ocean draining into a cavern changes
     * a few thousand blocks in a tick, and each of those used to be its own batch and its own
     * synchronous zlib pass on the tick thread - which is most of what the tick was doing.
     * Twenty bytes of block update also compress far better in company than alone.
     */
    public async flushBlockChanges(): Promise<void> {
        if (this.pendingBlocks.size === 0) return;

        const changes = [...this.pendingBlocks.values()];
        this.pendingBlocks.clear();

        const players = this.world.getPlayers();
        if (players.length === 0) return;

        const config = this.server.getConfig();
        const fullFlushFragments = config.getPacketFullFlushFragments?.() ?? false;
        const fragmentCache = fullFlushFragments ? new FullFlushFragmentCache() : undefined;

        // With proximity off every client is told about everything, so the bytes are identical and
        // one compression per protocol version serves every client who speaks it.
        if (!this.server.getConfig().getProximityBroadcast()) {
            await broadcastSharedBatches(
                players.map((player) => player.getNetworkSession().getConnection()),
                this.blockPackets(changes).map(({ packet }) => packet),
                this.server.getConfig().getPacketCompressionLevel(),
                (error) => this.server.getLogger().error(error),
                // The configured threshold was already negotiated per connection; leave the override unset.
                undefined,
                { fullFlushFragments, fragmentCache }
            );
            return;
        }

        const changesByChunk = new Map<string, { readonly order: number; readonly change: BlockChange }[]>();
        for (const [order, change] of changes.entries()) {
            const chunkX = toChunk(change.position.getX());
            const chunkZ = toChunk(change.position.getZ());
            const key = `${chunkX},${chunkZ}`;
            const bucket = changesByChunk.get(key);
            const entry = { order, change };
            if (bucket === undefined) changesByChunk.set(key, [entry]);
            else bucket.push(entry);
        }

        const groupsByCodec = new Map<
            ProtocolCodec,
            Map<
                string,
                {
                    readonly indices: number[];
                    readonly players: Player[];
                    readonly compressionAlgorithm: ClientConnection['compressionAlgorithm'];
                    readonly compressionThreshold: number;
                }
            >
        >();
        for (const player of players) {
            const viewer = player.getPosition();
            const centerX = toChunk(viewer.getX());
            const centerZ = toChunk(viewer.getZ());
            const reach = effectiveViewDistance(player.viewDistance) + VIEW_MARGIN_CHUNKS;
            const bucketRadius = Math.ceil(reach);
            const reachSquared = reach * reach;
            const visible: { readonly order: number; readonly change: BlockChange }[] = [];

            for (let offsetX = -bucketRadius; offsetX <= bucketRadius; offsetX++) {
                for (let offsetZ = -bucketRadius; offsetZ <= bucketRadius; offsetZ++) {
                    if (offsetX * offsetX + offsetZ * offsetZ > reachSquared) continue;
                    const bucket = changesByChunk.get(`${centerX + offsetX},${centerZ + offsetZ}`);
                    if (bucket === undefined) continue;

                    for (const entry of bucket) {
                        if (isInView({ event: entry.change.position, viewer, viewDistance: player.viewDistance }))
                            visible.push(entry);
                    }
                }
            }

            if (visible.length === 0) continue;
            visible.sort((left, right) => left.order - right.order);

            const indices = visible.map(({ order }) => order);
            const connection = player.getNetworkSession().getConnection();
            const codec = connection.codec;
            let groups = groupsByCodec.get(codec);
            if (groups === undefined) {
                groups = new Map();
                groupsByCodec.set(codec, groups);
            }

            // Compression settings are negotiated per connection, so equal visibility sets
            // only share a frame when their algorithm and threshold also match.
            const signature = `${connection.compressionAlgorithm}:${connection.compressionThreshold}:${indices.join(',')}`;
            const group = groups.get(signature);
            if (group === undefined)
                groups.set(signature, {
                    indices,
                    players: [player],
                    compressionAlgorithm: connection.compressionAlgorithm,
                    compressionThreshold: connection.compressionThreshold
                });
            else group.players.push(player);
        }

        const compressionLevel = this.server.getConfig().getPacketCompressionLevel();
        const sends: Promise<void>[] = [];

        for (const [codec, groups] of groupsByCodec) {
            const encodedPackets = new Map<string, { packet: NetworkPacket<unknown>; buffer: Buffer }>();
            for (const group of groups.values()) {
                const visibleChanges = group.indices.map((index) => {
                    const change = changes[index];
                    if (change === undefined) throw new Error(`Missing block change at flush index ${index}`);
                    return change;
                });
                // Viewers can see different sets of chunks while sharing some of them. Cache
                // each complete wire packet so those shared subchunks are encoded once without
                // changing aggregation, visibility, or the per-viewer packet stream.
                const packets: NetworkPacket<unknown>[] = [];
                const buffers: Buffer[] = [];
                for (const { key, packet } of this.blockPackets(visibleChanges)) {
                    let encoded = encodedPackets.get(key);
                    if (encoded === undefined) {
                        const prepared = encodePacketsForCodec([packet], codec);
                        const preparedPacket = prepared.packets[0];
                        const buffer = prepared.buffers[0];
                        if (preparedPacket === undefined || buffer === undefined)
                            throw new Error('Missing encoded block packet');
                        encoded = { packet: preparedPacket, buffer };
                        encodedPackets.set(key, encoded);
                    }
                    packets.push(encoded.packet);
                    buffers.push(encoded.buffer);
                }

                const batch = encodePacketBatchFromBuffersBySize(packets, buffers, {
                    compressionLevel,
                    compressionAlgorithm: group.compressionAlgorithm,
                    compressionThreshold: group.compressionThreshold,
                    fullFlushFragments,
                    fragmentCache,
                    fragmentCodec: codec
                });
                if (batch instanceof Promise) {
                    const failedPacket = packets[0];
                    if (failedPacket === undefined) throw new Error('A block-change batch has no packet to report');
                    for (const player of group.players) {
                        sends.push(
                            player.getNetworkSession().getConnection().sendSharedBatchAsync(batch, failedPacket)
                        );
                    }
                } else {
                    for (const player of group.players) {
                        sends.push(
                            player
                                .getNetworkSession()
                                .getConnection()
                                .sendSharedBatch(batch.content, batch.packets, false, batch.packetBuffers)
                        );
                    }
                }
            }
        }

        await Promise.all(
            sends.map(async (send) => {
                try {
                    await send;
                } catch (error: unknown) {
                    this.server.getLogger().error(error);
                }
            })
        );
    }

    /**
     * The Protocol packets for a set of block changes.
     *
     * One `UpdateSubChunkBlocksPacket` per sub chunk that changed more than one block, which
     * is the packet the protocol has for exactly this and what keeps a `/fill` from becoming
     * twenty thousand packets in one batch - a batch that size disconnects a real client. A
     * sub chunk with one change keeps its `UpdateBlockPacket`, which is the shorter of the two
     * for a single block and what a placement or a break sends.
     *
     * Grouping reorders changes across sub chunks. Nothing reads that order: the pending map
     * is keyed by position, so each position appears once and the result is the same whichever
     * sub chunk lands first.
     * @param {BlockChange[]} changes - What to put in the batch.
     * @returns Packets and stable cache keys, in sub chunk order.
     */
    private blockPackets(changes: readonly BlockChange[]): BlockPacket[] {
        const bySubChunk = new Map<string, BlockChange[]>();
        for (const change of changes) {
            const key = subChunkKey(change.position);
            const bucket = bySubChunk.get(key);
            if (bucket === undefined) bySubChunk.set(key, [change]);
            else bucket.push(change);
        }

        const packets: BlockPacket[] = [];
        for (const bucket of bySubChunk.values()) {
            const single = bucket.length === 1 ? bucket[0] : undefined;
            if (single !== undefined) {
                packets.push({ key: `block:${blockChangeKey(single)}`, packet: updateBlockPacket(single) });
                continue;
            }

            const firstChange = bucket[0];
            if (firstChange === undefined) throw new Error('A block-change subchunk cannot be empty');
            packets.push({
                key: `subchunk:${subChunkKey(firstChange.position)}:${bucket.map(blockChangeKey).join(';')}`,
                packet: new UpdateSubChunkBlocksPacket({
                    subChunkBlockPosition: subChunkOrigin(firstChange.position),
                    blocksChanged: {
                        standards: bucket.map(
                            ({ position, blockRuntimeId }) =>
                                new UpdateSubChunkNetworkBlockInfo(
                                    new BlockPos(position.getX(), position.getY(), position.getZ()),
                                    blockRuntimeId,
                                    BLOCK_UPDATE_FLAGS,
                                    0n,
                                    0
                                )
                        ),
                        // The second layer is waterlogging, and a pending change only ever
                        // carries the first.
                        extras: []
                    }
                })
            });
        }

        return packets;
    }

    /**
     * @inheritdoc
     *
     * One `BlockActorDataPacket` per position rather than a shared batch, which is the
     * opposite of what {@link flushBlockChanges} does and right for the opposite reason. The
     * block changes are thousands of twenty-byte packets with the same contents for everyone;
     * these are a handful of whole compounds, and the audience differs per position, so there
     * is nothing for a shared compression to amortize.
     *
     * The audience is {@link getViewers}, whose test is already the disc of chunks the client
     * was streamed - see `world/Proximity.ts`. A client without the chunk has no block entity
     * to replace and drops the packet, and the chunk it gets later carries the new compound in
     * its own payload, so neither order loses the change.
     */
    public async flushBlockEntities(): Promise<void> {
        if (this.pendingBlockEntities.size === 0) return;

        const changes = [...this.pendingBlockEntities.values()];
        this.pendingBlockEntities.clear();

        for (const { position, tags } of changes) {
            const packet = new BlockActorDataPacket({
                blockPosition: new BlockPos(position.getX(), position.getY(), position.getZ()),
                actorDataTags: tags
            });

            this.sendAround(position, packet);
        }
    }

    /** @inheritdoc */
    public blockSound(position: Vector3, sound: LevelSoundEvent, blockRuntimeId: number, except?: Player): void {
        const packet = new LevelSoundEventPacket();
        packet.sound = sound;

        // Center of the block, not its corner: the sound is placed in the world and a whole
        // block off is audible when it is right next to you. Only the packet is centered - the
        // audience is still resolved at the block itself, which is the position the world
        // named and the one that still carries which world it is in.
        packet.positionX = position.getX() + 0.5;
        packet.positionY = position.getY() + 0.5;
        packet.positionZ = position.getZ() + 0.5;

        packet.extraData = blockRuntimeId; // In this case refers to block runtime Id
        packet.entityType = SOUND_ACTOR_TYPE[sound] ?? '';
        packet.isBabyMob = false;
        packet.disableRelativeVolume = false;

        this.sendAround(position, packet, { radius: SOUND_RADIUS, exclude: except });
    }

    /** @inheritdoc */
    public namedSound(position: Vector3, name: string, options: NamedSoundOptions = {}): void {
        const packet = new PlaySoundPacket();
        packet.name = name;
        packet.position = position;
        packet.volume = options.volume ?? 1;
        packet.pitch = options.pitch ?? 1;

        this.sendAround(position, packet, { radius: SOUND_RADIUS });
    }

    /** @inheritdoc */
    public namedParticle(position: Vector3, name: string): void {
        const packet = new SpawnParticleEffectPacket();
        packet.dimensionId = this.world.getDimension().bedrockId;
        packet.effectName = name;
        packet.position = position;

        this.sendAround(position, packet, { radius: WORLD_EVENT_RADIUS });
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
        packet.entityUniqueId = entity.getRuntimeId();
        packet.isBabyMob = false;
        packet.disableRelativeVolume = false;

        this.sendAround(position, packet, { radius: SOUND_RADIUS });
    }

    /** @inheritdoc */
    public worldEffect(position: Vector3 | null, effect: LevelEvent, data: number): void {
        const protocolPosition = position === null ? null : new Vec3(position.getX(), position.getY(), position.getZ());
        // Without this every event played at the world origin: the sound arrived with no
        // direction to it and the particles were nowhere near the block.
        const packet = new LevelEventPacket({ eventId: effect, position: protocolPosition, data });

        if (position === null) {
            this.send(packet);
            return;
        }

        this.sendAround(position, packet, { radius: WORLD_EVENT_RADIUS });
    }

    /** @inheritdoc */
    public async actorEffect(entity: Entity, effect: ActorEvent, data: number): Promise<void> {
        const packetForViewer = (): ActorEventPacket => {
            const packet = new ActorEventPacket();
            packet.runtimeEntityId = entity.getRuntimeId();
            packet.event = effect;
            packet.data = data;
            return packet;
        };
        const sends = [this.sendToTrackedEntity(entity, () => [packetForViewer()])];
        if (entity instanceof Player) sends.push(entity.getNetworkSession().send(packetForViewer()));
        await Promise.all(sends);
    }

    /** @inheritdoc */
    public async entityAttributesChanged(entity: Entity, attributes: Attribute[]): Promise<void> {
        if (attributes.length === 0) return;

        const packetsForCodec = (): UpdateAttributesPacket[] => {
            const packet = new UpdateAttributesPacket();
            packet.runtimeEntityId = entity.getRuntimeId();
            packet.attributes = attributes;
            packet.tick = 0n;
            return [packet];
        };
        const sends = [this.sendToTrackedEntity(entity, packetsForCodec)];
        if (entity instanceof Player) {
            sends.push(entity.getNetworkSession().sendAttributesFor(entity, attributes));
        }
        await Promise.all(sends);
    }

    /** @inheritdoc */
    public async statusEffectChanged(entity: Entity, effect: StatusEffect, change: StatusEffectChange): Promise<void> {
        const effectId = bedrockMobEffectId(effect.id);
        if (effectId === undefined) return;

        const packetForViewer = (): MobEffectPacket => {
            const packet = new MobEffectPacket();
            packet.targetRuntimeId = entity.getRuntimeId();
            packet.eventId =
                change === 'add'
                    ? MobEffectEvent.Add
                    : change === 'update'
                      ? MobEffectEvent.Update
                      : MobEffectEvent.Remove;
            packet.effectId = effectId;
            packet.effectAmplifier = effect.amplifier;
            packet.showParticles = effect.showParticles;
            packet.effectDurationTicks = effect.durationTicks;
            packet.tick = 0n;
            packet.ambient = effect.ambient;
            return packet;
        };
        const sends = [this.sendToTrackedEntity(entity, () => [packetForViewer()])];
        if (entity instanceof Player) {
            sends.push(entity.getNetworkSession().sendStatusEffect(entity, effect, change));
        }
        await Promise.all(sends);
    }

    /** @inheritdoc */
    public async entityMetadataChanged(entity: Entity): Promise<void> {
        const runtimeEntityId = entity.getRuntimeId();
        const metadata = entity.metadata;
        const syncedProperties = entity.getSyncedProperties();
        const packetsForCodec = (): SetActorDataPacket[] => {
            const packet = new SetActorDataPacket();
            packet.runtimeEntityId = runtimeEntityId;
            packet.metadata = metadata;
            packet.syncedProperties = syncedProperties;
            packet.tick = 0n;
            return [packet];
        };
        const sends = [this.sendToTrackedEntity(entity, packetsForCodec)];
        if (entity instanceof Player) sends.push(entity.getNetworkSession().sendMetadataFor(entity));
        await Promise.all(sends);
    }

    /** @inheritdoc */
    public async entityEquipmentChanged(entity: Entity): Promise<void> {
        const worn = entity.getEquipment();
        const runtimeEntityId = entity.getRuntimeId();
        const packetsForCodec = (codec: ProtocolCodec): NetworkPacket<unknown>[] => {
            const context = codec.context;
            const packets: NetworkPacket<unknown>[] = [
                new MobArmorEquipmentPacket({
                    runtimeEntityId,
                    head: (worn.head ?? Item.air()).toStackDescriptor(context),
                    chest: (worn.chest ?? Item.air()).toStackDescriptor(context),
                    legs: (worn.legs ?? Item.air()).toStackDescriptor(context),
                    feet: (worn.feet ?? Item.air()).toStackDescriptor(context),
                    body: (worn.body ?? Item.air()).toStackDescriptor(context)
                }),
                new MobEquipmentPacket({
                    runtimeEntityId,
                    item: (worn.mainhand ?? Item.air()).toStackDescriptor(context),
                    inventorySlot: 0,
                    hotbarSlot: 0,
                    windowId: 0
                })
            ];
            if (worn.offhand !== undefined) {
                packets.push(
                    new MobEquipmentPacket({
                        runtimeEntityId,
                        item: worn.offhand.toStackDescriptor(context),
                        inventorySlot: 0,
                        hotbarSlot: 0,
                        windowId: WindowIds.OFFHAND
                    })
                );
            }
            return packets;
        };
        const sends = [this.sendToTrackedEntity(entity, packetsForCodec)];
        if (entity instanceof Player) sends.push(entity.getNetworkSession().sendEquipmentFor(entity));
        await Promise.all(sends);
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
    public entityMoved(entity: Entity, teleport = false): void {
        // Keep one final pose per actor for the tick. Its packet is encoded once for each
        // protocol codec, then viewers join their own visible subset from those shared bytes.
        const runtimeId = Number(entity.getRuntimeId());
        const previous = this.pendingMoves.get(runtimeId);
        // Preserve a teleport flag until flush so later ordinary movement in this same tick
        // cannot turn a required snap into interpolation from the stale pre-teleport pose.
        const wasTeleport = previous !== undefined && (previous.flags & MoveActorAbsolutePacket.FLAG_TELEPORT) !== 0;
        this.pendingMoves.set(runtimeId, movePacketFor(entity, teleport || wasTeleport));
    }

    /** @inheritdoc */
    public async timeChanged(ticks: number): Promise<void> {
        // Try to send it at the same time to all
        await Promise.all(this.world.getPlayers().map((player) => player.getNetworkSession().sendTime(ticks)));
    }

    /** @inheritdoc */
    public async gameRuleChanged(name: string, value: boolean | number, editable: boolean): Promise<void> {
        const rule = toNetworkGameRule(name, value, editable);
        await Promise.all(
            this.world.getPlayers().map(async (player) => player.getNetworkSession().sendGameRules([rule]))
        );
    }

    /** @inheritdoc */
    public async reconcile(entities: Entity[]): Promise<void> {
        await Promise.all(
            this.world.getPlayers().map(async (player) => player.getNetworkSession().reconcileTrackedEntities(entities))
        );
    }

    /**
     * Sends viewer-independent state to trackers, encoding one packet set per negotiated codec.
     * A player entity's own connection is left to its PlayerSession method so prediction packets
     * retain that client's input tick; observer packets use tick zero and share safely.
     * @param entity - The actor whose state changed.
     * @param packetsForCodec - Builds the packet values with the selected codec's context.
     */
    private async sendToTrackedEntity(
        entity: Entity,
        packetsForCodec: (codec: ProtocolCodec) => readonly NetworkPacket<unknown>[]
    ): Promise<void> {
        const runtimeId = entity.getRuntimeId();
        const playersByCodec = new Map<ProtocolCodec, ClientConnection[]>();
        for (const player of this.world.getPlayers()) {
            if (player === entity) continue;
            const session = player.getNetworkSession();
            if (!session.tracks(runtimeId)) continue;

            const connection = session.getConnection();
            const group = playersByCodec.get(connection.codec);
            if (group === undefined) playersByCodec.set(connection.codec, [connection]);
            else group.push(connection);
        }

        const compressionLevel = this.server.getConfig().getPacketCompressionLevel();
        await Promise.all(
            [...playersByCodec].map(async ([codec, connections]) => {
                await broadcastSharedBatches(connections, packetsForCodec(codec), compressionLevel, (error) =>
                    this.server.getLogger().error(error)
                );
            })
        );
    }

    /** @inheritdoc */
    public async flushMovement(): Promise<void> {
        if (this.pendingMoves.size === 0) return;

        const pendingMoves = [...this.pendingMoves.entries()];
        this.pendingMoves.clear();
        const playersByCodec = new Map<ProtocolCodec, Player[]>();
        for (const player of this.world.getPlayers()) {
            const codec = player.getNetworkSession().getConnection().codec;
            const players = playersByCodec.get(codec);
            if (players === undefined) playersByCodec.set(codec, [player]);
            else players.push(player);
        }

        const compressionLevel = this.server.getConfig().getPacketCompressionLevel();
        const fullFlushFragments = this.server.getConfig().getPacketFullFlushFragments?.() ?? false;
        const fragmentCache = fullFlushFragments ? new FullFlushFragmentCache() : undefined;
        const sends: Promise<void>[] = [];

        for (const [codec, players] of playersByCodec) {
            // Resolve visibility once per viewer, then encode only the union. This keeps the
            // tracker checks linear in viewers × moved actors instead of rescanning viewers
            // once for every moved actor.
            const visibleMovesByPlayer = new Map<Player, (typeof pendingMoves)[number][]>();
            const visibleRuntimeIds = new Set<number>();
            for (const player of players) {
                const session = player.getNetworkSession();
                const viewerRuntimeId = player.getRuntimeId();
                const visibleMoves = pendingMoves.filter(
                    ([, packet]) => packet.runtimeEntityId !== viewerRuntimeId && session.tracks(packet.runtimeEntityId)
                );
                if (visibleMoves.length === 0) continue;
                visibleMovesByPlayer.set(player, visibleMoves);
                for (const [runtimeId] of visibleMoves) visibleRuntimeIds.add(runtimeId);
            }

            const sharedMoves = pendingMoves.filter(([runtimeId]) => visibleRuntimeIds.has(runtimeId));
            if (sharedMoves.length === 0) continue;

            const encoded = encodePacketsForCodec(
                sharedMoves.map(([, packet]) => packet),
                codec
            );
            const packetByRuntimeId = new Map<
                number,
                { readonly packet: NetworkPacket<unknown>; readonly buffer: Buffer }
            >();
            for (const [index, [runtimeId]] of sharedMoves.entries()) {
                const packet = encoded.packets[index];
                const buffer = encoded.buffers[index];
                if (packet === undefined || buffer === undefined) {
                    throw new Error(`Missing encoded movement for runtime id ${runtimeId}`);
                }
                packetByRuntimeId.set(runtimeId, { packet, buffer });
            }

            const visibleGroups = new Map<
                string,
                {
                    readonly packets: NetworkPacket<unknown>[];
                    readonly buffers: Buffer[];
                    readonly connections: ClientConnection[];
                    readonly compressionAlgorithm: ClientConnection['compressionAlgorithm'];
                    readonly compressionThreshold: number;
                }
            >();
            for (const [player, visibleMoves] of visibleMovesByPlayer) {
                const session = player.getNetworkSession();
                const connection = session.getConnection();

                const signature = `${connection.compressionAlgorithm}:${connection.compressionThreshold}:${visibleMoves
                    .map(([runtimeId]) => runtimeId)
                    .join(',')}`;
                let group = visibleGroups.get(signature);
                if (group === undefined) {
                    const packets: NetworkPacket<unknown>[] = [];
                    const buffers: Buffer[] = [];
                    for (const [runtimeId] of visibleMoves) {
                        const encodedMove = packetByRuntimeId.get(runtimeId);
                        if (encodedMove === undefined)
                            throw new Error(`Missing movement bytes for runtime id ${runtimeId}`);
                        packets.push(encodedMove.packet);
                        buffers.push(encodedMove.buffer);
                    }
                    group = {
                        packets,
                        buffers,
                        connections: [],
                        compressionAlgorithm: connection.compressionAlgorithm,
                        compressionThreshold: connection.compressionThreshold
                    };
                    visibleGroups.set(signature, group);
                }
                group.connections.push(session.getConnection());
            }

            const batchByVisibility = new Map<string, EncodedPacketBatch | Promise<EncodedPacketBatch>>();
            for (const [signature, group] of visibleGroups) {
                let batch = batchByVisibility.get(signature);
                if (batch === undefined) {
                    batch = encodePacketBatchFromBuffersBySize(group.packets, group.buffers, {
                        compressionLevel,
                        compressionAlgorithm: group.compressionAlgorithm,
                        compressionThreshold: group.compressionThreshold,
                        fullFlushFragments,
                        fragmentCache,
                        fragmentCodec: codec
                    });
                    batchByVisibility.set(signature, batch);
                }

                if (batch instanceof Promise) {
                    const failedPacket = group.packets[0];
                    if (failedPacket === undefined) throw new Error('A movement batch has no packet to report');
                    for (const connection of group.connections) {
                        sends.push(connection.sendSharedBatchAsync(batch, failedPacket));
                    }
                } else {
                    for (const connection of group.connections) {
                        sends.push(
                            connection.sendSharedBatch(batch.content, batch.packets, false, batch.packetBuffers)
                        );
                    }
                }
            }
        }

        await Promise.all(sends);
    }

    /**
     * Puts one packet on several connections, compressing it once.
     *
     * Recipients on the same protocol version get the same bytes, so each version's packet
     * layouts are encoded and compressed once, then framed for everyone on that version.
     *
     * The buffer is safe to share: `getBuffer()` returns a fresh copy on the write path,
     * RakNet only reads it, and fragmentation takes read-only slices of it.
     * @param {Player[]} audience - Who receives it.
     * @param packet - The packet to send.
     */
    private sendToAll<T extends NetworkPacket<unknown>>(audience: Player[], packet: T): void {
        if (audience.length === 0) return;

        // One recipient is the common case for anything happening near a single player, and
        // the ordinary path already does exactly this.
        if (audience.length === 1) {
            void audience[0]!.getNetworkSession().send(packet);
            return;
        }

        broadcastSharedBatches(
            audience.map((player) => player.getNetworkSession().getConnection()),
            [packet],
            this.server.getConfig().getPacketCompressionLevel(),
            (error) => this.server.getLogger().error(error)
        );
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
