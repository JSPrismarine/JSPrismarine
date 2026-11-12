import { Vector3 } from '@jsprismarine/math';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import type { ProtocolCodec } from '@jsprismarine/protocol';
import type { LevelSoundEvent } from '@jsprismarine/minecraft';
import { LevelSoundEvent as SoundEvent } from '@jsprismarine/minecraft';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import type Server from '../Server';
import type { Attribute } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { StatusEffect, StatusEffectChange } from '../entity/StatusEffect';
import type { ShownActor } from '../world/ShownActor';
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
import type { WorldChangeSink } from '../world/WorldChangeSink';
import type { EntityId } from '../world/changelog/ChangeEntry';
import type { OccurrenceEntry, OccurrenceKinds } from '../world/changelog/ChangeEntry';
import type { SealedTick } from '../world/changelog/ChangeLog';
import type { EntityView } from '../entity/data/actorView';
import type { BlockPositionKey } from '../world/positionKeys';
import { BlockReplica } from './replica/BlockReplica';
import type { BlockAt, BlockReplicaCounts } from './replica/BlockReplica';
import { EntityReplica } from './replica/EntityReplica';
import type { EntityReplicaCounts } from './replica/EntityReplica';
import { broadcastSharedBatches } from './MinecraftSession';
import type ClientConnection from './ClientConnection';
import type PlayerSession from './PlayerSession';
import { encodePacketBatchFromBuffersBySize, encodePacketsForCodec, FullFlushFragmentCache } from './encodePacketBatch';
import type { EncodedPacketBatch } from './encodePacketBatch';
import ActorEventPacket from '@jsprismarine/protocol/packet/ActorEventPacket';
import AnimatePacket from '@jsprismarine/protocol/packet/AnimatePacket';
import EmotePacket from '@jsprismarine/protocol/packet/EmotePacket';
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

/** Builds the actor pose packet once, before the move is fanned out to tracking sessions. */
const movePacketFor = (entity: ShownActor, teleport: boolean): MoveActorAbsolutePacket => {
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

/** A player's animation, as the players that see it are shown it. */
const animatePacketOf = ({ entity, action, data, swingSource }: OccurrenceKinds['animate']): AnimatePacket => {
    const packet = new AnimatePacket();
    packet.runtimeEntityId = entity;
    packet.action = action;
    packet.data = data;
    packet.swingSource = swingSource;
    return packet;
};

/** A player's emote, as the players that see it are shown it: a packet the server encodes itself. */
const emotePacketOf = ({
    entity,
    emote,
    lengthTicks,
    xuid,
    platformId,
    flags
}: OccurrenceKinds['emote']): EmotePacket => {
    const packet = new EmotePacket();
    packet.actorRuntimeId = entity;
    packet.emoteId = emote;
    packet.emoteLengthTicks = lengthTicks;
    packet.xuid = xuid;
    packet.platformId = platformId;
    packet.flags = flags;
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
     * Block changes read from the change log since the last flush, keyed by position.
     *
     * The map is the deduplication: physics rewrites the same position several times while a flow
     * settles, and only where it ended up is worth a packet.
     */
    private readonly pendingBlocks = new Map<BlockPositionKey, BlockChange>();

    /**
     * Block entities whose fields the change log changed since the last flush, keyed by position.
     *
     * Keyed for the same reason {@link pendingBlocks} is, and with more to gain from it: a
     * block entity update carries the whole compound rather than a block's four bytes, so a
     * chest written twice in a tick is two copies of its 27 slots if nothing collapses them.
     */
    private readonly pendingBlockEntities = new Map<BlockPositionKey, BlockAt>();

    /** The block entities of the world's loaded chunks, which a block entity update is folded from. */
    private readonly blocks = new BlockReplica();

    /** The world's entities as the change log has them, which D4c sends from. */
    private readonly entities: EntityReplica;
    /** The occurrences read from the change log since the last flush, in log order. */
    private readonly pendingOccurrences: OccurrenceEntry[] = [];

    /** Last pose for each actor that moved since the world's previous movement flush. */
    private readonly pendingMoves = new Map<number, MoveActorAbsolutePacket>();

    public constructor(
        private readonly world: World,
        private readonly server: Server
    ) {
        this.entities = new EntityReplica(() => server.getContent());
    }

    /**
     * Everyone in this world who should be told about something that happened at `position`.
     *
     * The single answer to "who receives this". Every positional broadcast goes through here,
     * so there is one place that decides and one place to change - before this, each call site
     * picked its own collection and several of them reached across worlds.
     * @param {Vector3 | null} position - Where it happened; `null` means the whole world.
     * @param {AudienceOptions} [options] - Narrowing.
     * @returns The recipients' sessions: online, in this world, near enough.
     */
    public getViewers(position: Vector3 | null, options?: AudienceOptions): PlayerSession[] {
        const excluded = options?.exclude;
        const viewers = this.world.getViewers();
        let candidates = viewers;
        if (excluded !== undefined) {
            // By entity id, which is what a session holds of its player.
            const ids = new Set(
                ('getRuntimeId' in excluded ? [excluded] : excluded).map((left) => left.getRuntimeId())
            );
            candidates = viewers.filter((session) => !ids.has(session.runtimeId));
        }

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

        return candidates.filter((session) =>
            isInView({
                event: position,
                viewer: session.getViewPosition(),
                viewDistance: session.getViewDistance(),
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
    public tickSealed(sealed: SealedTick): void {
        const { blocks, blockEntities } = this.blocks.read(sealed);
        // Keyed by position, so a block written twice before a flush - which liquid physics does
        // constantly, and a cascade of falling sand does by nature - travels once, as whatever it
        // finally settled on.
        for (const [key, { x, y, z, block }] of blocks)
            this.pendingBlocks.set(key, { position: new Vector3(x, y, z), blockRuntimeId: block });
        for (const [key, at] of blockEntities) this.pendingBlockEntities.set(key, at);
        // Read, not sent yet: `StoreActors.sync` still sends the entities until D4c moves it here.
        this.entities.read(sealed);
        for (const entry of sealed.entries) if (entry.kind === 'occurrence') this.pendingOccurrences.push(entry);
    }

    /**
     * @inheritdoc
     *
     * Each occurrence is encoded once for each codec and compression group of its audience, as
     * {@link sendToAll} does, and the audience is worked out once, here, rather than by the code
     * that made the occurrence.
     */
    public async flushOccurrences(): Promise<void> {
        if (this.pendingOccurrences.length === 0) return;
        const occurrences = this.pendingOccurrences.splice(0);
        const sends: Promise<void>[] = [];
        for (const occurrence of occurrences) {
            const send = this.sendOccurrence(occurrence);
            if (send !== undefined) sends.push(send);
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
     * Sends one occurrence to its audience.
     * @returns The send, for the occurrences whose sends are awaited.
     */
    private sendOccurrence(entry: OccurrenceEntry): Promise<void> | undefined {
        switch (entry.occurrence) {
            case 'world-effect':
                this.sendWorldEffect(entry.data);
                return undefined;
            case 'block-sound':
                this.sendBlockSound(entry.data);
                return undefined;
            case 'named-sound':
                this.sendNamedSound(entry.data);
                return undefined;
            case 'named-particle':
                this.sendNamedParticle(entry.data);
                return undefined;
            case 'actor-sound':
                this.sendActorSound(entry.data);
                return undefined;
            case 'actor-event':
                return this.sendActorEvent(entry.data);
            case 'animate':
                return this.sendToTrackedEntity({ getRuntimeId: () => entry.data.entity }, () => [
                    animatePacketOf(entry.data)
                ]);
            case 'relayed-sound':
                this.sendRelayedSound(entry.data);
                return undefined;
            case 'emote':
                return this.sendToTrackedEntity({ getRuntimeId: () => entry.data.entity }, () => [
                    emotePacketOf(entry.data)
                ]);
            default:
                // A shown block goes out with the block changes, and a vetoed action is a record.
                return undefined;
        }
    }

    /** @inheritdoc */
    public chunkEntered(x: number, z: number, blockEntities: Iterable<NBTTagCompound>): void {
        this.blocks.chunkEntered(x, z, blockEntities);
    }

    /** @inheritdoc */
    public chunkLeft(x: number, z: number): void {
        this.blocks.chunkLeft(x, z);
    }

    /** What the block replica holds and has done, for reports and tests. */
    public blockReplicaCounts(): BlockReplicaCounts {
        return this.blocks.counts();
    }

    /**
     * What a client is shown of one entity, folded from the change log.
     * @param entity - The entity's runtime id.
     * @returns The view, or undefined when no entry of the log has shown the entity entering.
     */
    public entityView(entity: EntityId): EntityView | undefined {
        return this.entities.view(entity, (identity) => {
            const session = this.world.getViewers().find((candidate) => candidate.identity.uuid === identity);
            return session === undefined ? undefined : Number(session.runtimeId);
        });
    }

    /** What the entity replica holds and has done, for reports and tests. */
    public entityReplicaCounts(): EntityReplicaCounts {
        return this.entities.counts();
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

        const viewers = this.world.getViewers();
        if (viewers.length === 0) return;

        const config = this.server.getConfig();
        const fullFlushFragments = config.getPacketFullFlushFragments?.() ?? false;
        const fragmentCache = fullFlushFragments ? new FullFlushFragmentCache() : undefined;

        // With proximity off every client is told about everything, so the bytes are identical and
        // one compression per protocol version serves every client who speaks it.
        if (!this.server.getConfig().getProximityBroadcast()) {
            await broadcastSharedBatches(
                viewers.map((session) => session.getConnection()),
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
                    readonly sessions: PlayerSession[];
                    readonly compressionAlgorithm: ClientConnection['compressionAlgorithm'];
                    readonly compressionThreshold: number;
                }
            >
        >();
        for (const session of viewers) {
            const viewer = session.getViewPosition();
            const viewDistance = session.getViewDistance();
            const centerX = toChunk(viewer.getX());
            const centerZ = toChunk(viewer.getZ());
            const reach = effectiveViewDistance(viewDistance) + VIEW_MARGIN_CHUNKS;
            const bucketRadius = Math.ceil(reach);
            const reachSquared = reach * reach;
            const visible: { readonly order: number; readonly change: BlockChange }[] = [];

            for (let offsetX = -bucketRadius; offsetX <= bucketRadius; offsetX++) {
                for (let offsetZ = -bucketRadius; offsetZ <= bucketRadius; offsetZ++) {
                    if (offsetX * offsetX + offsetZ * offsetZ > reachSquared) continue;
                    const bucket = changesByChunk.get(`${centerX + offsetX},${centerZ + offsetZ}`);
                    if (bucket === undefined) continue;

                    for (const entry of bucket) {
                        if (isInView({ event: entry.change.position, viewer, viewDistance })) visible.push(entry);
                    }
                }
            }

            if (visible.length === 0) continue;
            visible.sort((left, right) => left.order - right.order);

            const indices = visible.map(({ order }) => order);
            const connection = session.getConnection();
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
                    sessions: [session],
                    compressionAlgorithm: connection.compressionAlgorithm,
                    compressionThreshold: connection.compressionThreshold
                });
            else group.sessions.push(session);
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
                    for (const session of group.sessions) {
                        sends.push(session.getConnection().sendSharedBatchAsync(batch, failedPacket));
                    }
                } else {
                    for (const session of group.sessions) {
                        sends.push(
                            session
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

        for (const at of changes) {
            // Null when the block entity is gone: the block change that took it says so.
            const tags = this.blocks.compound(at);
            if (tags === null) continue;
            const packet = new BlockActorDataPacket({
                blockPosition: new BlockPos(at.x, at.y, at.z),
                actorDataTags: tags
            });

            this.sendAround(new Vector3(at.x, at.y, at.z), packet);
        }
    }

    /** A block's noise, to the players near it but the one whose own client plays it. */
    private sendBlockSound({ x, y, z, sound, block, except }: OccurrenceKinds['block-sound']): void {
        const packet = new LevelSoundEventPacket();
        packet.sound = sound;

        // Center of the block, not its corner: the sound is placed in the world and a whole
        // block off is audible when it is right next to you. Only the packet is centered - the
        // audience is still resolved at the block itself.
        packet.positionX = x + 0.5;
        packet.positionY = y + 0.5;
        packet.positionZ = z + 0.5;

        packet.extraData = block; // In this case refers to block runtime Id
        packet.entityType = SOUND_ACTOR_TYPE[sound] ?? '';
        packet.isBabyMob = false;
        packet.disableRelativeVolume = false;

        this.sendAround(new Vector3(x, y, z), packet, {
            radius: SOUND_RADIUS,
            ...(except === null ? {} : { exclude: { getRuntimeId: () => except } })
        });
    }

    /** A sound by name, to the players near it. */
    private sendNamedSound({ x, y, z, name, volume, pitch }: OccurrenceKinds['named-sound']): void {
        const position = new Vector3(x, y, z);
        const packet = new PlaySoundPacket();
        packet.name = name;
        packet.position = position;
        packet.volume = volume;
        packet.pitch = pitch;

        this.sendAround(position, packet, { radius: SOUND_RADIUS });
    }

    /** A particle effect by name, to the players near it. */
    private sendNamedParticle({ x, y, z, name }: OccurrenceKinds['named-particle']): void {
        const position = new Vector3(x, y, z);
        const packet = new SpawnParticleEffectPacket();
        packet.dimensionId = this.world.getDimension().bedrockId;
        packet.effectName = name;
        packet.position = position;

        this.sendAround(position, packet, { radius: WORLD_EVENT_RADIUS });
    }

    /** A sound a client made, to the players near it but that client. */
    private sendRelayedSound(relayed: OccurrenceKinds['relayed-sound']): void {
        const packet = new LevelSoundEventPacket();
        packet.sound = relayed.sound;
        packet.positionX = relayed.x;
        packet.positionY = relayed.y;
        packet.positionZ = relayed.z;
        packet.extraData = relayed.data;
        packet.entityType = relayed.type;
        packet.isBabyMob = relayed.baby;
        packet.disableRelativeVolume = relayed.global;
        packet.entityUniqueId = relayed.actor;
        packet.fireAtPosition =
            relayed.firedAt === null ? null : new Vector3(relayed.firedAt.x, relayed.firedAt.y, relayed.firedAt.z);

        this.sendAround(new Vector3(relayed.x, relayed.y, relayed.z), packet, {
            radius: SOUND_RADIUS,
            exclude: { getRuntimeId: () => relayed.sender }
        });
    }

    /** An entity's noise, to the players near where it stood. */
    private sendActorSound({ entity, x, y, z, sound, type }: OccurrenceKinds['actor-sound']): void {
        const packet = new LevelSoundEventPacket();
        packet.sound = sound;
        packet.positionX = x;
        packet.positionY = y;
        packet.positionZ = z;

        // Not a block runtime id here - for an actor sound the extra data is a pitch adjustment,
        // and -1 means "whatever this mob's own sound is". A zero would be read as a block.
        packet.extraData = -1;

        // Which mob is making it, so the client picks the zombie's grunt rather than a generic
        // thud. A player is deliberately the empty string: the client uses its own player sounds,
        // and naming `minecraft:player` here plays them twice.
        packet.entityType = this.world.viewerOf(entity) === undefined ? type : '';
        packet.entityUniqueId = entity;
        packet.isBabyMob = false;
        packet.disableRelativeVolume = false;

        this.sendAround(new Vector3(x, y, z), packet, { radius: SOUND_RADIUS });
    }

    /** A numbered level event, at a point or to the whole world. */
    private sendWorldEffect({ position, effect, data }: OccurrenceKinds['world-effect']): void {
        const protocolPosition = position === null ? null : new Vec3(position.x, position.y, position.z);
        // Without this every event played at the world origin: the sound arrived with no
        // direction to it and the particles were nowhere near the block.
        const packet = new LevelEventPacket({ eventId: effect, position: protocolPosition, data });

        if (position === null) {
            this.send(packet);
            return;
        }

        this.sendAround(new Vector3(position.x, position.y, position.z), packet, { radius: WORLD_EVENT_RADIUS });
    }

    /** Something that happened to one entity, to the players tracking it and to its own client. */
    private async sendActorEvent({ entity, event, data }: OccurrenceKinds['actor-event']): Promise<void> {
        const packetForViewer = (): ActorEventPacket => {
            const packet = new ActorEventPacket();
            packet.runtimeEntityId = entity;
            packet.event = event;
            packet.data = data;
            return packet;
        };
        const sends = [this.sendToTrackedEntity({ getRuntimeId: () => entity }, () => [packetForViewer()])];
        const own = this.world.viewerOf(entity);
        if (own !== undefined) sends.push(own.send(packetForViewer()));
        await Promise.all(sends);
    }

    /** @inheritdoc */
    public async entityAttributesChanged(entity: ShownActor, attributes: Attribute[]): Promise<void> {
        if (attributes.length === 0) return;

        const packetsForCodec = (): UpdateAttributesPacket[] => {
            const packet = new UpdateAttributesPacket();
            packet.runtimeEntityId = entity.getRuntimeId();
            packet.attributes = attributes;
            packet.tick = 0n;
            return [packet];
        };
        const sends = [this.sendToTrackedEntity(entity, packetsForCodec)];
        const own = this.world.viewerOf(entity.getRuntimeId());
        if (own !== undefined) sends.push(own.sendAttributesFor(entity, attributes));
        await Promise.all(sends);
    }

    /** @inheritdoc */
    public async statusEffectChanged(
        entity: ShownActor,
        effect: StatusEffect,
        change: StatusEffectChange
    ): Promise<void> {
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
        const own = this.world.viewerOf(entity.getRuntimeId());
        if (own !== undefined) sends.push(own.sendStatusEffect(entity, effect, change));
        await Promise.all(sends);
    }

    /** @inheritdoc */
    public async entityMetadataChanged(entity: ShownActor): Promise<void> {
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
        const own = this.world.viewerOf(runtimeEntityId);
        if (own !== undefined) sends.push(own.sendMetadataFor(entity));
        await Promise.all(sends);
    }

    /** @inheritdoc */
    public async entityEquipmentChanged(entity: ShownActor): Promise<void> {
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
        // The viewers only. A player's own client keeps its inventory itself, and a held item
        // named at hotbar slot zero would move its selection there.
        await this.sendToTrackedEntity(entity, packetsForCodec);
    }

    /** @inheritdoc */
    public async entityAdded(entity: ShownActor): Promise<void> {
        const runtimeId = entity.getRuntimeId();
        // Everything already here, shown to the arriving player. Itself excluded by the
        // tracker, since a client is never sent a spawn for the entity it is controlling.
        await this.world.viewerOf(runtimeId)?.reconcileTrackedEntities(this.world.shownActors());

        // And the arriving entity offered to everyone already here. This used to return early
        // for a player, so an arriving player was shown the world but the world was never
        // shown them - which is why the resource pack handler needed a pairwise loop of its
        // own across every player on the server.
        await Promise.all(
            this.world
                .getViewers()
                .filter((session) => session.runtimeId !== runtimeId)
                .map(async (session) => session.considerEntity(entity))
        );
    }

    /** @inheritdoc */
    public async entityRemoved(entity: ShownActor): Promise<void> {
        // Through the tracker rather than `despawnFrom`, so only the clients that were
        // actually shown this entity are told to take it away, and so every client forgets it
        // either way - a stale id left behind would block it from ever being tracked again.
        await Promise.all(this.world.getViewers().map(async (session) => session.dropEntity(entity)));
    }

    /** @inheritdoc */
    public entityMoved(entity: ShownActor, teleport = false): void {
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
        await Promise.all(this.world.getViewers().map((session) => session.sendTime(ticks)));
    }

    /** @inheritdoc */
    public async gameRuleChanged(name: string, value: boolean | number, editable: boolean): Promise<void> {
        const rule = toNetworkGameRule(name, value, editable);
        await Promise.all(this.world.getViewers().map(async (session) => session.sendGameRules([rule])));
    }

    /** @inheritdoc */
    public async reconcile(entities: readonly ShownActor[]): Promise<void> {
        await Promise.all(this.world.getViewers().map(async (session) => session.reconcileTrackedEntities(entities)));
    }

    /**
     * Sends viewer-independent state to trackers, encoding one packet set per negotiated codec.
     * A player entity's own connection is left to its PlayerSession method so prediction packets
     * retain that client's input tick; observer packets use tick zero and share safely.
     * @param entity - The actor whose state changed.
     * @param packetsForCodec - Builds the packet values with the selected codec's context.
     */
    private async sendToTrackedEntity(
        entity: Pick<ShownActor, 'getRuntimeId'>,
        packetsForCodec: (codec: ProtocolCodec) => readonly NetworkPacket<unknown>[]
    ): Promise<void> {
        const runtimeId = entity.getRuntimeId();
        const playersByCodec = new Map<ProtocolCodec, ClientConnection[]>();
        for (const session of this.world.getViewers()) {
            // By id, not by object: `tracks` answers yes for a client's own entity, and a player
            // in the entity store is shown through an actor, not the object its session holds.
            if (session.runtimeId === runtimeId || !session.tracks(runtimeId)) continue;

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
        const sessionsByCodec = new Map<ProtocolCodec, PlayerSession[]>();
        for (const session of this.world.getViewers()) {
            const codec = session.getConnection().codec;
            const sessions = sessionsByCodec.get(codec);
            if (sessions === undefined) sessionsByCodec.set(codec, [session]);
            else sessions.push(session);
        }

        const compressionLevel = this.server.getConfig().getPacketCompressionLevel();
        const fullFlushFragments = this.server.getConfig().getPacketFullFlushFragments?.() ?? false;
        const fragmentCache = fullFlushFragments ? new FullFlushFragmentCache() : undefined;
        const sends: Promise<void>[] = [];

        for (const [codec, sessions] of sessionsByCodec) {
            // Resolve visibility once per viewer, then encode only the union. This keeps the
            // tracker checks linear in viewers × moved actors instead of rescanning viewers
            // once for every moved actor.
            const visibleMovesBySession = new Map<PlayerSession, (typeof pendingMoves)[number][]>();
            const visibleRuntimeIds = new Set<number>();
            for (const session of sessions) {
                const visibleMoves = pendingMoves.filter(
                    ([, packet]) =>
                        packet.runtimeEntityId !== session.runtimeId && session.tracks(packet.runtimeEntityId)
                );
                if (visibleMoves.length === 0) continue;
                visibleMovesBySession.set(session, visibleMoves);
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
            for (const [session, visibleMoves] of visibleMovesBySession) {
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
     * @param audience - The sessions that receive it.
     * @param packet - The packet to send.
     */
    private sendToAll<T extends NetworkPacket<unknown>>(audience: PlayerSession[], packet: T): void {
        if (audience.length === 0) return;

        // One recipient is the common case for anything happening near a single player, and
        // the ordinary path already does exactly this.
        if (audience.length === 1) {
            void audience[0]!.send(packet);
            return;
        }

        broadcastSharedBatches(
            audience.map((session) => session.getConnection()),
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
