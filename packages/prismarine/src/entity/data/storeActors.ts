/**
 * The store's entities, shown to clients from store state.
 *
 * Every entity in the store gets one {@link StoreActor}, a {@link ShownActor} that answers the
 * network layer from the store: its position, rotation and velocity from the body, its health
 * from the instance, its equipment from the body's drops, and its metadata from the actor
 * metadata projection. Tracking, `AddActorPacket` and the per-tick updates encode a store entity
 * through it, so a client sees a store entity with no legacy body behind it.
 *
 * {@link StoreActors.sync} is the per-tick half. It sends what changed since it last sent each
 * entity: a move, new metadata or synced properties, a health change and new equipment. That is
 * replication's job, and it keeps what it sent, not a second copy of the simulation. Slice 7 of
 * the entity and tick re-architecture replaces the comparison with a read of the change log
 * ([ADR 0016](../../../../../docs/adr/0016-replication-reads-the-change-log.md)).
 *
 * Nothing here is mob-specific. Any entity type in the store is shown the same way, with the
 * metadata its projection gives it.
 */
import { Vector3 } from '@jsprismarine/math';
import type { EntityPosition } from '@jsprismarine/entities';
import { Attribute, AttributeIds, Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import { Metadata } from '@jsprismarine/protocol/wire/structures/Metadata';
import type { SyncedProperties } from '@jsprismarine/protocol/wire/structures/SyncedProperties';

import type { ServerContent } from '../../content/ServerContent';
import { sameSyncedProperties, syncedPropertiesOf } from '../../network/actorProperties';
import type PlayerSession from '../../network/PlayerSession';
import type { ShownActor } from '../../world/ShownActor';
import type { World } from '../../world/World';
import { sameEquipmentItems, viewableEquipmentOf } from '../equipment';
import type { ViewableEquipment } from '../predicateView';
import type { StatusEffect } from '../StatusEffect';
import type { DataEntity } from './DataEntity';
import type { EntityRuntime } from './EntityRuntime';
import { boxOf } from './facts';
import {
    actorMetadataInputs,
    actorMetadataProjection,
    applyActorMetadataProjection,
    sameActorMetadataInputs,
    sameActorMetadataProjection
} from './actorMetadata';
import type { ActorMetadataInputs, ActorMetadataProjection } from './actorMetadata';

/** How far an entity has to move before the movement is worth putting on the wire, in blocks. */
const MOVEMENT_EPSILON = 1e-4;

/** How far clients follow a store entity, in chunks, which is the legacy entities' default. */
const TRACKING_RANGE_CHUNKS = 8;

/** Where a store entity was last shown to clients, which the next move is measured from. */
interface ShownPose {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
    readonly pitch: number;
}

/**
 * One store entity as the network layer reads it.
 *
 * Position, rotation, velocity, synced properties, status effects and the ground state are read
 * from the store on every call. The metadata, the attributes and the equipment are encoded
 * forms that {@link StoreActors} rebuilds when the store changes them.
 */
export class StoreActor implements ShownActor {
    /** The actor metadata a client is sent, kept up to date by {@link StoreActors.sync}. */
    public readonly metadata = new Metadata();
    /** The attributes a client is sent, which carry the store's health. */
    public readonly attributes: Attributes;

    /** What this actor was last sent as, which {@link StoreActors.sync} measures changes against. */
    public shownPose: ShownPose;
    public shownProperties: SyncedProperties;
    public shownProjection: ActorMetadataProjection;
    public shownInputs: ActorMetadataInputs | undefined;
    public shownOwner: number | undefined;
    public shownEquipmentRevision = -1;
    private equipment: ViewableEquipment = {};

    public constructor(
        /** The store entity behind the actor. */
        public readonly entity: DataEntity,
        content: ServerContent,
        leashHolderId: number | undefined
    ) {
        const health = entity.instance.attributes.get('health');
        // The type's maximum rather than `Attributes.getDefaults`' twenty, so a client draws a
        // ten-health cow with five hearts instead of with two and a half. A type with no health
        // is sent none, so an armor stand is not drawn as a living thing.
        this.attributes = new Attributes(health === undefined ? [] : Attributes.getDefaults());
        if (health !== undefined)
            this.attributes.setAttribute(
                new Attribute({
                    name: AttributeIds.Health,
                    min: 0,
                    max: health.max,
                    def: health.max,
                    value: health.current
                })
            );

        const { width, height } = boxOf(content.entities.registry, entity.identifier);
        this.metadata.setBoundingBox(width, height);
        this.shownProjection = actorMetadataProjection(entity, leashHolderId);
        applyActorMetadataProjection(this, this.shownProjection);
        this.shownProperties = this.getSyncedProperties();
        this.shownOwner = entity.body.owner;
        this.shownPose = StoreActor.poseOf(entity);
        this.writeEquipment(content);
    }

    /** Where a store entity stands and faces now. */
    public static poseOf(entity: DataEntity): ShownPose {
        const at = entity.position;
        return { x: at.x, y: at.y, z: at.z, yaw: entity.body.yaw, pitch: entity.body.pitch };
    }

    /** @inheritdoc */
    public getRuntimeId(): bigint {
        return BigInt(this.entity.id);
    }

    /** @inheritdoc */
    public getType(): string {
        return this.entity.identifier;
    }

    /** @inheritdoc */
    public getPosition(): Vector3 {
        const at = this.entity.position;
        return new Vector3(at.x, at.y, at.z);
    }

    /** @inheritdoc */
    public getVelocity(): Vector3 {
        return Vector3.fromObject(this.entity.body.velocity);
    }

    public get pitch(): number {
        return this.entity.body.pitch;
    }

    public get yaw(): number {
        return this.entity.body.yaw;
    }

    /** A store entity's head turns with its body. */
    public get headYaw(): number {
        return this.entity.body.yaw;
    }

    /** @inheritdoc */
    public getSyncedProperties(): SyncedProperties {
        return syncedPropertiesOf(this.entity.instance.properties);
    }

    /** @inheritdoc */
    public getEquipment(): ViewableEquipment {
        return this.equipment;
    }

    /** @inheritdoc */
    public getStatusEffects(): readonly StatusEffect[] {
        return [...this.entity.body.statusEffects.values()];
    }

    /** @inheritdoc */
    public isOnGround(): boolean {
        return this.entity.conditions.has('on_ground');
    }

    /** @inheritdoc */
    public getTrackingRange(): number {
        return TRACKING_RANGE_CHUNKS;
    }

    /** @inheritdoc */
    public async spawnTo(session: PlayerSession): Promise<void> {
        await session.sendAddActor(this);
    }

    /**
     * Rebuilds the equipment items when the body's equipment revision moved.
     *
     * Two guards, cheapest first. The revision counter answers "has anything been written at
     * all", which on a steady tick is false for every entity in the world, so nothing is built.
     * When it has moved, the items are built and compared as the bytes they would be sent as.
     *
     * @returns Whether a client would see different equipment.
     */
    public writeEquipment(content: ServerContent): boolean {
        if (this.shownEquipmentRevision === this.entity.body.equipmentRevision) return false;
        this.shownEquipmentRevision = this.entity.body.equipmentRevision;

        const worn = viewableEquipmentOf(this.entity.equipment, content);
        if (sameEquipmentItems(this.equipment, worn)) return false;
        this.equipment = worn;
        return true;
    }
}

/** What {@link StoreActors} is built over. */
export interface StoreActorsOptions {
    /** The live world, read at call time, because the runtime outlives any one world load. */
    world(): World | undefined;
    /** Receives everything the actors met and could not carry out. */
    report(message: string): void;
    /** Hears each new actor metadata projection, for a legacy body that still carries one. */
    projected?(entity: DataEntity, projection: ActorMetadataProjection): void;
}

/** The actors of one dimension's store, one per entity. */
export class StoreActors {
    private readonly actors = new Map<number, StoreActor>();

    public constructor(private readonly options: StoreActorsOptions) {}

    /** The actor of one store entity, or undefined when it has none. */
    public actorOf(id: number): StoreActor | undefined {
        return this.actors.get(id);
    }

    /** Every actor, in the order the store made them. */
    public all(): IterableIterator<StoreActor> {
        return this.actors.values();
    }

    /** How many actors there are, which is what a test counts. */
    public get size(): number {
        return this.actors.size;
    }

    /** Shows a store entity the runtime just made to the clients in range. */
    public add(entity: DataEntity, leashHolderId?: number): void {
        const world = this.options.world();
        if (world === undefined) return;

        const actor = new StoreActor(entity, world.getServer().getContent(), leashHolderId);
        this.actors.set(entity.id, actor);
        this.options.projected?.(entity, actor.shownProjection);
        void world.showActor(actor).catch((error: unknown) => this.failed('show', error));
    }

    /** Takes a store entity the runtime removed off every client that was shown it. */
    public remove(entity: DataEntity): void {
        const actor = this.actors.get(entity.id);
        this.actors.delete(entity.id);
        if (actor === undefined) return;

        const world = this.options.world();
        if (world === undefined) return;
        void world.hideActor(actor).catch((error: unknown) => this.failed('hide', error));
    }

    /**
     * Sends clients what changed in the store since each entity was last sent, after a tick of
     * the runtime: its health, equipment, metadata and synced properties, and its position.
     *
     * @param runtime - The entity runtime whose entities are shown.
     * @param shouldSync - Optional chunk eligibility rule for derived metadata and properties.
     * @returns The broadcasts, which the caller awaits with the rest of its tick.
     */
    public sync(runtime: EntityRuntime, shouldSync?: (position: EntityPosition) => boolean): readonly Promise<void>[] {
        const world = this.options.world();
        if (world === undefined) return [];
        const content = world.getServer().getContent();
        const sends: Promise<void>[] = [];

        for (const entity of runtime.all()) {
            const actor = this.actors.get(entity.id);
            if (actor === undefined) continue;
            const isTicking = shouldSync === undefined || shouldSync(entity.position);

            const health = entity.instance.attributes.get('health');
            if (health !== undefined) actor.attributes.setValue(AttributeIds.Health, health.current);
            if (actor.writeEquipment(content)) world.entityEquipmentChanged(actor);

            const ownerChanged = actor.shownOwner !== entity.body.owner;
            if (ownerChanged) actor.shownOwner = entity.body.owner;
            let metadataChanged = false;
            if (isTicking || ownerChanged) {
                const leashHolderId = runtime.leashHolderIdOf(entity.id);
                // Most ticks nothing a projection reads has changed, so it is not built at all.
                const inputs = actorMetadataInputs(entity, leashHolderId);
                if (!sameActorMetadataInputs(actor.shownInputs, inputs)) {
                    actor.shownInputs = inputs;
                    const projection = actorMetadataProjection(entity, leashHolderId);
                    metadataChanged = !sameActorMetadataProjection(actor.shownProjection, projection);
                    if (metadataChanged) {
                        applyActorMetadataProjection(actor, projection);
                        actor.shownProjection = projection;
                        this.options.projected?.(entity, projection);
                    }
                }
            }

            let propertiesChanged = false;
            if (isTicking) {
                const properties = actor.getSyncedProperties();
                propertiesChanged = !sameSyncedProperties(actor.shownProperties, properties);
                if (propertiesChanged) actor.shownProperties = properties;
            }
            if (metadataChanged || propertiesChanged) sends.push(world.sendActorMetadata(actor));

            const move = this.showPose(world, actor);
            if (move !== undefined) sends.push(move);
        }
        return sends;
    }

    /** Forgets every actor, for a world that is closing. */
    public clear(): void {
        this.actors.clear();
    }

    /** Sends a move when the entity stands or faces anywhere new. */
    private showPose(world: World, actor: StoreActor): Promise<void> | undefined {
        const entity = actor.entity;
        const pose = StoreActor.poseOf(entity);
        const shown = actor.shownPose;
        const still =
            Math.abs(shown.x - pose.x) < MOVEMENT_EPSILON &&
            Math.abs(shown.y - pose.y) < MOVEMENT_EPSILON &&
            Math.abs(shown.z - pose.z) < MOVEMENT_EPSILON &&
            shown.yaw === pose.yaw &&
            shown.pitch === pose.pitch;
        const teleport = entity.body.teleportPending;
        entity.body.teleportPending = false;
        if (still) return undefined;

        actor.shownPose = pose;
        return world.broadcastMove(actor, teleport);
    }

    private failed(what: string, error: unknown): void {
        this.options.report(`could not ${what} a store entity to its clients: ${String(error)}`);
    }
}
