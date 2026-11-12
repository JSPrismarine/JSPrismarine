/**
 * A world's entities, replicated to its clients from the change log
 * ([ADR 0016](../../../../../docs/adr/0016-replication-reads-the-change-log.md)).
 *
 * Each sealed tick is read into the {@link EntityReplica}, and what the tick changed is sent after
 * the seal. An entity that entered is shown to the clients in range as it entered, and one that
 * left is taken off the clients that were shown it. An entity whose fields or slots a tick wrote is
 * visited, and only those: its equipment, its metadata, its health and its pose are sent when they
 * differ from what its viewers were last sent. That comparison is a throttle over the entities the
 * log names, as the breath's is, and it keeps the packets those viewers get the ones a comparison
 * of every entity against its last send used to give them. Nothing here reads a live entity: a
 * first sight is built from the replica too, encoded once for each codec and compression group.
 */
import type { Point3 } from '../../world/Proximity';
import type { ProtocolCodec } from '@jsprismarine/protocol';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import MoveActorAbsolutePacket from '@jsprismarine/protocol/packet/MoveActorAbsolutePacket';
import SetActorDataPacket from '@jsprismarine/protocol/packet/SetActorDataPacket';
import UpdateAttributesPacket from '@jsprismarine/protocol/packet/UpdateAttributesPacket';
import { Vector3 } from '@jsprismarine/math';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import { Metadata } from '@jsprismarine/protocol/wire/structures/Metadata';
import type { SyncedProperties } from '@jsprismarine/protocol/wire/structures/SyncedProperties';

import type { ServerContent } from '../../content/ServerContent';
import { applyActorMetadataProjection, sameActorMetadataProjection } from '../../entity/data/actorMetadata';
import type { ActorMetadataProjection } from '../../entity/data/actorMetadata';
import { healthAttributesOf } from '../../entity/data/actorView';
import type { EntityView, ShownHealth, ShownPose } from '../../entity/data/actorView';
import { ITEM_STATE_FIELD, itemStackOfState } from '../../entity/data/droppedItems';
import { boxOf } from '../../entity/data/facts';
import { sameEquipmentItems, viewableEquipmentOf } from '../../entity/equipment';
import { breathWorthSending } from '../../entity/playerBreath';
import type { ShownBreath } from '../../entity/playerBreath';
import { mayFlyIn } from '../../entity/playerComponents';
import { EYE_HEIGHT } from '../../entity/playerEyes';
import { PLAYER_IDENTIFIER } from '../../entity/playerOverlay';
import { HAND_SLOT_FIELD, HEAD_YAW_FIELD, slotKey } from '../../entity/playerShown';
import type { ShownPlayerState } from '../../entity/playerShown';
import type { ViewableEquipment } from '../../entity/predicateView';
import { restoredItem } from '../../inventory/persistence';
import { itemOfSlotValue } from '../../inventory/slotLog';
import type { EntityId } from '../../world/changelog/ChangeEntry';
import type { SealedTick } from '../../world/changelog/ChangeLog';
import { ACTOR_TRACKING_RANGE_CHUNKS, ITEM_TRACKING_RANGE_CHUNKS } from '../../world/ShownActor';
import type { ShownEntity } from '../../world/ShownActor';
import { PLAYER_TRACKING_RANGE_CHUNKS } from '../../world/ShownPlayer';
import { sameSyncedProperties } from '../actorProperties';
import { encodePacketBatchBySize } from '../encodePacketBatch';
import type { EncodedPacketBatch } from '../encodePacketBatch';
import type PlayerSession from '../PlayerSession';
import type { EntityRef, HeldEntity, MembershipChange, PlayerIdOf, ShownKind } from './EntityReplica';
import type { EntityReplica } from './EntityReplica';
import { equipmentPackets, firstSightPackets } from './firstSight';
import type { FirstSight, SightIdentity } from './firstSight';
import { allSent } from '../allSent';

/** How far an entity has to move before the movement is worth putting on the wire, in blocks. */
const MOVEMENT_EPSILON = 1e-4;

/**
 * The fields that move an entity, which a move is sent for and nothing else reads. A player's head
 * turns apart from its body, so a tick that writes only the head yaw still sends a move.
 */
const POSE_FIELDS: ReadonlySet<string> = new Set(['position', 'yaw', 'pitch', 'teleports', HEAD_YAW_FIELD]);

/** The fields no metadata, property or health of an entity reads, so a tick writing only these is not projected. */
const UNSHOWN_FIELDS: ReadonlySet<string> = new Set([
    ...POSE_FIELDS,
    'velocity',
    'statusEffectClock',
    'condition:on_ground'
]);

/** What a dropped stack's metadata projects to: nothing beyond its box. */
const NO_PROJECTION: ActorMetadataProjection = { flags: [], properties: [] };

/** One first-sight batch, encoded or compressing, with the packet to name if it fails. */
type FirstSightBatch = {
    readonly batch: EncodedPacketBatch | Promise<EncodedPacketBatch>;
    readonly first: NetworkPacket<unknown>;
};

/** What the viewers of one entity were last sent of it. */
type Shown = {
    readonly kind: ShownKind;
    /** The actor metadata as it was last sent, written over as it changes, as a client keeps it. */
    readonly metadata: Metadata;
    projection: ActorMetadataProjection;
    properties: SyncedProperties;
    pose: ShownPose;
    /** A player's head yaw as its viewers were last sent it; undefined for any other entity. */
    headYaw: number | undefined;
    health: ShownHealth | undefined;
    equipment: ViewableEquipment;
    /** A player's breath as its viewers were last told it, which is sent in steps. */
    breath: ShownBreath | undefined;
};

/** What entity replication needs of its world and server. */
export interface EntityReplicationPorts {
    /** The sessions of the world's players, which every audience is drawn from. */
    viewers(): readonly PlayerSession[];
    /** The session of the player an entity is, if it is one. */
    viewerOf(runtimeId: bigint): PlayerSession | undefined;
    /** Who a player is, from the session that speaks for it. */
    identityOf(runtimeId: bigint): SightIdentity | undefined;
    /** The content now, which decides the items and the boxes. */
    content(): ServerContent;
    /** The configured compression level for shared batches. */
    compressionLevel(): number;
    /** Sends packets built for each codec to every client that tracks an entity, but its own. */
    sendToTracked(
        runtimeId: bigint,
        packetsForCodec: (codec: ProtocolCodec) => readonly NetworkPacket<unknown>[]
    ): Promise<void>;
    /** Queues a move for the tick's movement flush. */
    queueMove(packet: MoveActorAbsolutePacket): void;
}

/** What entity replication has done, by count, for reports and tests. */
export type EntityReplicationCounts = {
    /** Entities whose changes a flush looked at. */
    readonly visited: number;
    /** First-sight batches encoded, one for each entity, codec and compression group a flush showed it to. */
    readonly firstSightEncodes: number;
    /** First-sight batches handed to a client. */
    readonly firstSights: number;
};

/** The entities of one world, as its clients are shown them from the change log. */
export class EntityReplication {
    private readonly shown = new Map<EntityId, Shown>();
    private memberships: MembershipChange[] = [];
    /** The entities that left, in the order they left, for {@link EntityReplication.flushDepartures}. */
    private readonly departures: EntityId[] = [];
    private fields = new Map<EntityId, Set<string>>();
    private slots = new Map<EntityId, Set<string>>();
    /** The first-sight batches of this flush, by entity, then codec, then compression settings. */
    private readonly sights = new Map<EntityId, Map<ProtocolCodec, Map<string, FirstSightBatch>>>();
    private visited = 0;
    private firstSightEncodes = 0;
    private firstSights = 0;

    public constructor(
        public readonly replica: EntityReplica,
        private readonly ports: EntityReplicationPorts
    ) {}

    /**
     * Reads one sealed tick into the replica and keeps what it changed for the next flush. A tick
     * whose flush never ran is sent with the next one.
     */
    public read(sealed: SealedTick): void {
        const changes = this.replica.read(sealed);
        this.memberships.push(...changes.memberships);
        for (const { change, entity } of changes.memberships) {
            if (change !== 'leave') continue;
            this.fields.delete(entity);
            this.slots.delete(entity);
        }
        merge(this.fields, changes.fields);
        merge(this.slots, changes.slots);
        this.sights.clear();
    }

    /**
     * Sends what the ticks read since the last flush changed: each entity that entered, in the
     * order they did, then each written entity's equipment and metadata in the order the replica
     * holds them, then their health. Moves are queued for the movement flush, and the entities
     * that left for {@link EntityReplication.flushDepartures}.
     */
    public flush(): Promise<void> {
        // Departures a failed tick never sent go first, ahead of anything that enters again.
        const sends = [this.flushDepartures()];
        const memberships = this.memberships;
        const fields = this.fields;
        const slots = this.slots;
        this.memberships = [];
        this.fields = new Map();
        this.slots = new Map();

        for (const [index, membership] of memberships.entries()) {
            // A leaving entity waits for `flushDepartures`, after the tick's occurrences, so an
            // event about it, such as a killing blow's hurt flash, reaches the clients tracking it
            // first. One that enters again later in this flush leaves in order instead.
            const entersAgain =
                membership.change === 'leave' &&
                memberships
                    .slice(index + 1)
                    .some(({ change, entity }) => change === 'enter' && entity === membership.entity);
            if (membership.change === 'leave' && !entersAgain) {
                this.shown.delete(membership.entity);
                this.departures.push(membership.entity);
            } else sends.push(this.showMembership(membership));
        }
        this.sights.clear();

        const written = new Set([...fields.keys(), ...slots.keys()]);
        // A holder that came or went changes the leash every entity it holds shows.
        if (memberships.length > 0) for (const entity of this.replica.leashed()) written.add(entity);
        const visits = [...written].flatMap((entity) => {
            const held = this.replica.held(entity);
            return held === undefined ? [] : [{ entity, held }];
        });
        visits.sort((left, right) => left.held.order - right.held.order);

        const health: (() => Promise<void>)[] = [];
        for (const { entity, held } of visits) {
            this.visited++;
            const changed = this.showChanges(
                entity,
                held,
                fields.get(entity) ?? NONE,
                slots.get(entity) ?? NONE,
                sends
            );
            if (changed !== undefined) health.push(changed);
        }
        // After the equipment and the metadata of every entity, as the attributes always went.
        for (const send of health) sends.push(send());
        this.sights.clear();
        return allSent(sends);
    }

    /**
     * Takes the entities that left since the last flush off every client: each client forgets
     * them, shown or not, because a stale id left behind would block one from ever being tracked
     * again.
     */
    public flushDepartures(): Promise<void> {
        return allSent(this.departures.splice(0).map((entity) => this.drop(entity)));
    }

    /**
     * Every entity the replica holds, as tracking reads it. Showing one sends what its viewers
     * were last sent of it, from the replica.
     */
    public shownEntities(): ShownEntity[] {
        return [...this.replica.entries()].map(([entity, held]) => this.sightOf(entity, held, this.shown.get(entity)));
    }

    /** What entity replication has done. */
    public counts(): EntityReplicationCounts {
        return { visited: this.visited, firstSightEncodes: this.firstSightEncodes, firstSights: this.firstSights };
    }

    /** The resolver of a leash a player holds, through the sessions of the world's players. */
    public readonly playerIdOf: PlayerIdOf = (identity) => {
        const session = this.ports.viewers().find((candidate) => candidate.identity.uuid === identity);
        return session === undefined ? undefined : Number(session.runtimeId);
    };

    private showMembership(membership: MembershipChange): Promise<void> {
        const { entity } = membership;
        const runtimeId = entity;
        // A first sight encoded for an earlier entry of this flush shows the entity as it entered
        // then; one that enters again is shown as it enters now.
        this.sights.delete(entity);
        if (membership.change === 'leave') {
            this.shown.delete(entity);
            return this.drop(entity);
        }

        const shown = this.firstShown(membership.entering);
        if (shown === undefined) return allSent([]);
        this.shown.set(entity, shown);
        // Everything already here, shown to an arriving player, which the tracker leaves itself out of.
        const sends = [this.ports.viewerOf(runtimeId)?.reconcileTrackedEntities(this.shownEntities()) ?? allSent([])];
        // And the arrival offered to everyone already here, as it entered.
        const sight = this.sightOf(entity, membership.entering, shown);
        for (const session of this.ports.viewers()) {
            if (session.runtimeId !== runtimeId) sends.push(session.considerEntity(sight));
        }
        return allSent(sends);
    }

    /** Has every client forget an entity, whether or not it was shown it. */
    private drop(entity: EntityId): Promise<void> {
        return allSent(this.ports.viewers().map((session) => session.dropEntity({ getRuntimeId: () => entity })));
    }

    /**
     * Sends what one written entity's viewers were not sent yet: its equipment and its metadata
     * now, and its move to the movement flush.
     * @returns Its health update, which goes after every entity's metadata, or undefined.
     */
    private showChanges(
        entity: EntityId,
        held: HeldEntity,
        fields: ReadonlySet<string>,
        slots: ReadonlySet<string>,
        sends: Promise<void>[]
    ): (() => Promise<void>) | undefined {
        const known = this.shown.get(entity);
        if (known === undefined) {
            // Held but never shown: an entity the replica took in before this flush began.
            const shown = this.firstShown(held);
            if (shown !== undefined) this.shown.set(entity, shown);
            return undefined;
        }
        const view = this.replica.view(held, this.playerIdOf);
        if (view === undefined) return undefined;
        const player = known.kind === 'player' ? this.replica.player(held) : undefined;

        if (known.kind !== 'item' && this.equipmentWritten(known.kind, fields, slots, player)) {
            const worn = this.equipmentOf(held, view, player);
            if (!sameEquipmentItems(known.equipment, worn)) {
                known.equipment = worn;
                sends.push(this.ports.sendToTracked(entity, (codec) => equipmentPackets(entity, worn, codec.context)));
            }
        }

        // An entity visited with nothing written is one whose leash holder came or went.
        const leashOnly = fields.size === 0 && slots.size === 0;
        if (known.kind !== 'item' && (leashOnly || some(fields, (field) => !UNSHOWN_FIELDS.has(field)))) {
            const changed = this.showMetadata(known, view, player);
            if (changed) sends.push(this.sendMetadata(entity, known));
        }

        if (some(fields, (field) => POSE_FIELDS.has(field))) this.showPose(entity, known, view, player, fields);

        if (held.identifier === PLAYER_IDENTIFIER || known.kind === 'item' || !fields.has('attribute:health')) return;
        const health = view.health;
        if (health === undefined || sameHealth(known.health, health)) return;
        known.health = health;
        return () =>
            this.ports.sendToTracked(entity, () => {
                const packet = new UpdateAttributesPacket();
                packet.runtimeEntityId = entity;
                // The health alone, as it was the one attribute that changed.
                packet.attributes = healthAttributesOf(health)
                    .getAttributes()
                    .filter((attribute) => attribute.getName() === AttributeIds.Health);
                packet.tick = 0n;
                return [packet];
            });
    }

    /** Writes a changed projection and a player's own state into the shown metadata. @returns Whether to send it. */
    private showMetadata(shown: Shown, view: EntityView, player: ShownPlayerState | undefined): boolean {
        let changed = false;
        if (!sameActorMetadataProjection(shown.projection, view.metadata)) {
            applyActorMetadataProjection(shown, view.metadata);
            shown.projection = view.metadata;
            changed = true;
        }
        if (player !== undefined) {
            const { metadata } = shown;
            const canFly = mayFlyIn(player.gamemode);
            if (metadata.sprinting !== player.sprinting || metadata.canFly !== canFly) changed = true;
            metadata.setSprinting(player.sprinting);
            metadata.setCanFly(canFly);
            const breath = { air: player.air, breathing: player.breathing };
            metadata.setAir(breath.air);
            metadata.setBreathing(breath.breathing);
            if (shown.breath === undefined || breathWorthSending(shown.breath, breath, metadata.maxAir)) {
                shown.breath = breath;
                changed = true;
            }
        }
        if (!sameSyncedProperties(shown.properties, view.properties)) {
            shown.properties = view.properties;
            changed = true;
        }
        return changed;
    }

    private sendMetadata(entity: EntityId, shown: Shown): Promise<void> {
        const { metadata, properties } = shown;
        const sends = [
            this.ports.sendToTracked(entity, () => {
                const packet = new SetActorDataPacket();
                packet.runtimeEntityId = entity;
                packet.metadata = metadata;
                packet.syncedProperties = properties;
                packet.tick = 0n;
                return [packet];
            })
        ];
        const own = this.ports.viewerOf(entity);
        if (own !== undefined)
            sends.push(
                own.sendMetadataFor({ getRuntimeId: () => entity, metadata, getSyncedProperties: () => properties })
            );
        return allSent(sends);
    }

    /** Queues a move when the entity stands or faces anywhere new since the last one sent. */
    private showPose(
        entity: EntityId,
        shown: Shown,
        view: EntityView,
        player: ShownPlayerState | undefined,
        fields: ReadonlySet<string>
    ): void {
        const pose = view.pose;
        const last = shown.pose;
        const still =
            Math.abs(last.x - pose.x) < MOVEMENT_EPSILON &&
            Math.abs(last.y - pose.y) < MOVEMENT_EPSILON &&
            Math.abs(last.z - pose.z) < MOVEMENT_EPSILON &&
            last.yaw === pose.yaw &&
            last.pitch === pose.pitch &&
            shown.headYaw === player?.headYaw;
        if (still) return;
        shown.pose = pose;
        shown.headYaw = player?.headYaw;

        const packet = new MoveActorAbsolutePacket();
        packet.runtimeEntityId = entity;
        packet.position =
            player === undefined
                ? new Vector3(pose.x, pose.y, pose.z)
                : new Vector3(pose.x, pose.y + EYE_HEIGHT, pose.z);
        packet.pitch = pose.pitch;
        packet.yaw = pose.yaw;
        packet.headYaw = player?.headYaw ?? pose.yaw;
        // A dropped stack is never said to be on the ground: the client draws its landing itself.
        packet.flags =
            (shown.kind !== 'item' && view.onGround ? MoveActorAbsolutePacket.FLAG_ON_GROUND : 0) |
            (fields.has('teleports') ? MoveActorAbsolutePacket.FLAG_TELEPORT : 0);
        this.ports.queueMove(packet);
    }

    /** Whether a tick wrote what an entity is shown holding and wearing. */
    private equipmentWritten(
        kind: ShownKind,
        fields: ReadonlySet<string>,
        slots: ReadonlySet<string>,
        player: ShownPlayerState | undefined
    ): boolean {
        if (kind !== 'player' || player === undefined) return fields.has('equipment');
        return (
            fields.has(HAND_SLOT_FIELD) ||
            some(slots, (slot) => slot === slotKey('inventory', player.handSlot) || !slot.startsWith('inventory:'))
        );
    }

    /** What an entity is shown holding and wearing: a player's from its slots, a mob's from its body. */
    private equipmentOf(held: EntityRef, view: EntityView, player: ShownPlayerState | undefined): ViewableEquipment {
        const content = this.ports.content();
        if (player === undefined) return viewableEquipmentOf(view.equipment, content);
        const item = (container: string, slot: number) =>
            itemOfSlotValue(this.replica.slot(held, container, slot) ?? null, content) ?? undefined;
        return {
            mainhand: item('inventory', player.handSlot),
            offhand: item('offhand', 0),
            head: item('armor', 0),
            chest: item('armor', 1),
            legs: item('armor', 2),
            feet: item('armor', 3)
        };
    }

    /** What an entity's viewers are sent when they first see it, built from the replica. */
    private firstShown(held: HeldEntity): Shown | undefined {
        const kind = this.replica.kindOf(held);
        const view = this.replica.view(held, this.playerIdOf);
        if (kind === undefined || view === undefined) return undefined;
        const player = kind === 'player' ? this.replica.player(held) : undefined;

        const metadata = new Metadata();
        const { width, height } = boxOf(this.ports.content().entities.registry, held.identifier);
        metadata.setBoundingBox(width, height);
        const projection = kind === 'item' ? NO_PROJECTION : view.metadata;
        const shown: Shown = {
            kind,
            metadata,
            projection,
            properties: view.properties,
            pose: view.pose,
            headYaw: player?.headYaw,
            health: view.health,
            equipment: kind === 'item' ? {} : this.equipmentOf(held, view, player),
            breath: undefined
        };
        applyActorMetadataProjection(shown, projection);
        if (player !== undefined) this.showMetadata(shown, view, player);
        return shown;
    }

    /** One entity as tracking reads it, showing what `shown` holds of it, or its state now. */
    private sightOf(entity: EntityId, held: HeldEntity, shown: Shown | undefined): ShownEntity {
        const view = this.replica.view(held, this.playerIdOf);
        const kind = shown?.kind ?? this.replica.kindOf(held);
        const pose = view?.pose ?? { x: 0, y: 0, z: 0 };
        const position: Point3 =
            kind === 'player' ? new Vector3(pose.x, pose.y + EYE_HEIGHT, pose.z) : new Vector3(pose.x, pose.y, pose.z);
        const range =
            kind === 'player'
                ? PLAYER_TRACKING_RANGE_CHUNKS
                : kind === 'item'
                  ? ITEM_TRACKING_RANGE_CHUNKS
                  : ACTOR_TRACKING_RANGE_CHUNKS;
        return {
            getRuntimeId: () => entity,
            getPosition: () => position,
            getTrackingRange: () => range,
            // Builds and queues the batch before it returns, so a batch that cannot be built
            // throws here and the entity is not marked as shown.
            spawnTo: (session) => {
                const known = shown ?? this.shown.get(entity) ?? this.firstShown(held);
                if (known === undefined || view === undefined) return Promise.resolve();
                const sight = this.firstSightBatch(entity, held, known, view, session);
                if (sight === undefined) return Promise.resolve();
                this.firstSights++;
                const { batch, first } = sight;
                // A large one compresses off the thread, and its place in the queue is held now.
                if (batch instanceof Promise) return session.getConnection().sendSharedBatchAsync(batch, first);
                return session
                    .getConnection()
                    .sendSharedBatch(batch.content, batch.packets, false, batch.packetBuffers);
            }
        };
    }

    /** The first-sight batch of an entity for one session's codec and compression, encoded once a flush. */
    private firstSightBatch(
        entity: EntityId,
        held: HeldEntity,
        shown: Shown,
        view: EntityView,
        session: PlayerSession
    ): FirstSightBatch | undefined {
        const connection = session.getConnection();
        const { codec } = connection;
        let byCodec = this.sights.get(entity);
        if (byCodec === undefined) {
            byCodec = new Map();
            this.sights.set(entity, byCodec);
        }
        let byCompression = byCodec.get(codec);
        if (byCompression === undefined) {
            byCompression = new Map();
            byCodec.set(codec, byCompression);
        }
        const key = `${connection.compressionAlgorithm}:${connection.compressionThreshold}`;
        const cached = byCompression.get(key);
        if (cached !== undefined) return cached;

        const sight = this.sightData(entity, held, shown, view);
        if (sight === undefined) return undefined;
        const packets = firstSightPackets(sight, codec.context);
        const [first] = packets;
        if (first === undefined) return undefined;
        // A dropped stack carries its item's NBT, so a shulker box full of written books can pass
        // the size that compresses off the thread.
        const batch = encodePacketBatchBySize(packets, codec, {
            compressionLevel: this.ports.compressionLevel(),
            compressionAlgorithm: connection.compressionAlgorithm,
            compressionThreshold: connection.compressionThreshold
        });
        this.firstSightEncodes++;
        const encoded = { batch, first };
        byCompression.set(key, encoded);
        return encoded;
    }

    private sightData(entity: EntityId, held: HeldEntity, shown: Shown, view: EntityView): FirstSight | undefined {
        const { metadata } = shown;
        if (shown.kind === 'item') {
            const stack = itemStackOfState(this.replica.field(held, ITEM_STATE_FIELD));
            const item = stack === undefined ? null : restoredItem(stack, this.ports.content());
            return { kind: 'item', runtimeId: entity, view, metadata, stack: item ?? undefined };
        }
        const player = shown.kind === 'player' ? this.replica.player(held) : undefined;
        if (player === undefined)
            return {
                kind: 'actor',
                runtimeId: entity,
                identifier: held.shownIdentifier,
                view,
                metadata,
                equipment: shown.equipment
            };
        const identity = this.ports.identityOf(entity);
        if (identity === undefined) return undefined;
        return { kind: 'player', runtimeId: entity, view, metadata, player, identity, equipment: shown.equipment };
    }
}

const NONE: ReadonlySet<string> = new Set();

const merge = (into: Map<EntityId, Set<string>>, from: ReadonlyMap<EntityId, ReadonlySet<string>>): void => {
    for (const [entity, names] of from) {
        const known = into.get(entity);
        if (known === undefined) into.set(entity, new Set(names));
        else for (const name of names) known.add(name);
    }
};

const some = (names: ReadonlySet<string>, test: (name: string) => boolean): boolean => {
    for (const name of names) if (test(name)) return true;
    return false;
};

const sameHealth = (left: ShownHealth | undefined, right: ShownHealth): boolean =>
    left !== undefined && left.current === right.current && left.max === right.max;
