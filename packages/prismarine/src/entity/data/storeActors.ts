/**
 * The store's entities, shown to clients from store state.
 *
 * Every entity in the store gets one {@link StoreActor}, a {@link ShownActor} that answers the
 * network layer from the store: its position, rotation and velocity from the body, its health
 * from the instance, its equipment from the body's drops, and its metadata from the actor
 * metadata projection. Tracking, `AddActorPacket` and the per-tick updates encode a store entity
 * through it, from store state alone.
 *
 * {@link StoreActors.sync} is the per-tick half. It sends what changed since it last sent each
 * entity: a move, new metadata or synced properties, a health change and new equipment. That is
 * replication's job, and it keeps what it sent, not a second copy of the simulation. Slice 7 of
 * the entity and tick re-architecture replaces the comparison with a read of the change log
 * ([ADR 0016](../../../../../docs/adr/0016-replication-reads-the-change-log.md)).
 *
 * Nothing here is mob-specific. Any entity type in the store is shown the same way, with the
 * metadata its projection gives it. Three kinds of entity get an actor of their own: a store
 * player (`storePlayers.ts`), a dropped stack (`itemActor.ts`), and a saved actor no pack
 * declares ({@link InertActor}).
 *
 * A store actor is also how the rest of the server reaches a store entity: commands and
 * selectors, blasts and swings, interactions, saves, portals and the plugin events. It
 * answers them from the store and hands every effect back to it: a blow goes through the store's
 * damage pipeline, a shove onto the entity's body, a status effect or a tag into its component
 * state. It keeps no copy of the simulation. What it keeps beside the store is what the store
 * does not model yet: the actor record tags a save carries forward, the portal clock, and the
 * clock of the status effects. Slices 7 and 9 of the entity and tick re-architecture take those
 * over, with replication from the change log and travel as messages.
 */
import { Vector3 } from '@jsprismarine/math';
import type { EntityPosition } from '@jsprismarine/entities';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import { Metadata } from '@jsprismarine/protocol/wire/structures/Metadata';
import type { SyncedProperties } from '@jsprismarine/protocol/wire/structures/SyncedProperties';

import type { ServerContent } from '../../content/ServerContent';
import { sameSyncedProperties, syncedPropertiesOf } from '../../network/actorProperties';
import type PlayerSession from '../../network/PlayerSession';
import type Server from '../../Server';
import type { PortalBlockRef } from '../../world/portal/DimensionTravel';
import { portalRuleOf } from '../../world/portal/rules';
import type { PortalRule } from '../../world/portal/rules';
import type { ShownActor } from '../../world/ShownActor';
import type { World } from '../../world/World';
import { DamageCause } from '../DamageCause';
import { DamageSource } from '../DamageSource';
import { sameEquipmentItems, viewableEquipmentOf } from '../equipment';
import { KNOCKBACK_LIFT } from '../knockback';
import { PORTAL_COOLDOWN_TICKS, PORTAL_TRANSITION_TICKS, PortalContact, portalCooldownOf } from '../PortalContact';
import type { ViewableEquipment } from '../predicateView';
import type { StatusEffect, StatusEffectChange, StatusEffectInput } from '../StatusEffect';
import {
    bedrockMobEffectId,
    mergeStatusEffect,
    normalizeStatusEffectId,
    removeStatusEffectFromMap
} from '../StatusEffect';
import { effectHealthChange, tickStatusEffects } from '../StatusEffectTick';
import { healthAttributesOf } from './actorView';
import type { ShownPose } from './actorView';
import type { DataEntity } from './DataEntity';
import type { DamageRoute } from './damagePipeline';
import { isDroppedItem } from './droppedItems';
import type { EntityRuntime } from './EntityRuntime';
import { acceptsStatusEffect } from './EntityRuntime';
import type { EntityBox } from './facts';
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

/** Where a store actor sends the blows and heals the rest of the server gives it. */
export interface StoreActorBlows {
    /** A blow through {@link StoreActor.damage} or a status effect, run through the store's pipeline. */
    hurt(entity: DataEntity, amount: number, source: DamageSource, route: DamageRoute): boolean;
    /** A lower health written through {@link StoreActor.setHealth}, by how much it is lower. */
    written(entity: DataEntity, taken: number, source: DamageSource): void;
    /** A heal, which the store applies up to the entity's maximum. */
    heal(entity: DataEntity, amount: number): boolean;
}

/**
 * One store entity as the network layer and the rest of the server read it.
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
    /** What a client is shown the actor holding and wearing, which {@link StoreActor.writeEquipment} keeps. */
    protected equipment: ViewableEquipment = {};

    /**
     * The actor record tags this server does not model, which the next save writes back, such
     * as the actor's `UniqueID`. A save writes the entity's record into it first.
     */
    public persistentNbt: NBTTagCompound | null = null;

    private portalCooldown = 0;
    private portalContactState: PortalContact | undefined;
    private lastUpdatedTick = -1;
    /** How many ticks the status effects have been ticked, the clock of an endless effect. */
    private statusEffectAge = 0;

    public constructor(
        /** The store entity behind the actor. */
        public readonly entity: DataEntity,
        private readonly world: World,
        leashHolderId: number | undefined,
        private readonly blows: StoreActorBlows
    ) {
        const content = world.getServer().getContent();
        this.attributes = healthAttributesOf(entity.instance.attributes.get('health'));

        const { width, height } = boxOf(content.entities.registry, entity.identifier);
        this.metadata.setBoundingBox(width, height);
        this.shownProjection = this.projectMetadata(leashHolderId);
        applyActorMetadataProjection(this, this.shownProjection);
        this.shownProperties = this.getSyncedProperties();
        this.shownOwner = entity.body.owner;
        this.shownPose = StoreActor.poseOf(entity);
    }

    /** The entity as `/debug` lists it. */
    public toString(): string {
        return `id: §a${this.entity.id}§r, name: §b${this.getName()}§r, type: §b${this.getType()}§r, ${this.getPosition().toString()}, world: §b${this.world.getName()}§r`;
    }

    /** The world the entity stands in. */
    public getWorld(): World {
        return this.world;
    }

    /** The server the world belongs to. */
    public getServer(): Server {
        return this.world.getServer();
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

    /**
     * The actor metadata the store state projects to, which the constructor and
     * {@link StoreActors.sync} write into {@link StoreActor.metadata}.
     * @param leashHolderId - The runtime id of whatever holds the entity's leash.
     */
    public projectMetadata(leashHolderId?: number): ActorMetadataProjection {
        return actorMetadataProjection(this.entity, leashHolderId);
    }

    /**
     * Writes what the entity decides about its metadata besides the projection, after the
     * projection is written. A plain entity has nothing more; a player's components do.
     *
     * @returns Whether clients should be sent the metadata again.
     */
    public showPlayerState(): boolean {
        return false;
    }

    /** Writes the store's health into the attributes a client is sent, after a tick. */
    public showHealth(current: number): void {
        this.attributes.setValue(AttributeIds.Health, current);
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

    /** Where the bottom of the body is, which for a store entity is its position. */
    public getFeetY(): number {
        return this.entity.position.y;
    }

    /** How big the entity is, from its type's collision box. */
    public getBox(): EntityBox {
        return boxOf(this.getServer().getContent().entities.registry, this.entity.identifier);
    }

    /** The entity's name tag, or an empty string when it has none. */
    public getName(): string {
        return this.entity.body.nameTag ?? '';
    }

    /** Names the entity in the store, which shows it to clients. */
    public setName(name: string): void {
        this.entity.body.nameTag = name;
    }

    /** The entity's health in the store, or zero for a type with no health. */
    public getHealth(): number {
        return this.entity.instance.attributes.get('health')?.current ?? 0;
    }

    /** The entity's maximum health in the store, or zero for a type with no health. */
    public getMaxHealth(): number {
        return this.entity.instance.attributes.get('health')?.max ?? 0;
    }

    /** Whether the entity is still in the store and has health left. */
    public isAlive(): boolean {
        return this.entity.removed === undefined && this.getHealth() > 0;
    }

    /** Whether a save writes the entity, which Bedrock's `minecraft:transient` turns off. */
    public shouldPersist(): boolean {
        return !this.entity.instance.hasComponent('minecraft:transient');
    }

    /**
     * Hands a blow to the store's damage pipeline, which decides it and applies it before this
     * returns.
     */
    public async damage(amount: number, source: DamageCause | DamageSource = DamageCause.Generic): Promise<boolean> {
        if (amount <= 0) return false;
        return this.blows.hurt(this.entity, amount, DamageSource.of(source), 'legacy_body');
    }

    /**
     * A health written onto the entity: a lower one, which is what `/kill` writes, is a blow for
     * the difference through the store's pipeline, and a higher one is a heal.
     */
    public async setHealth(health: number, source: DamageCause | DamageSource = DamageCause.Generic): Promise<void> {
        const current = this.entity.instance.attributes.get('health')?.current;
        if (current === undefined || health === current) return;
        if (health > current) this.blows.heal(this.entity, health - current);
        else this.blows.written(this.entity, current - health, DamageSource.of(source));
    }

    /** Heals the entity in the store. */
    public async heal(amount: number): Promise<boolean> {
        return this.blows.heal(this.entity, amount);
    }

    /** Adds an impulse to the entity body the runtime integrates each tick. */
    public applyImpulse(impulse: EntityPosition): void {
        this.entity.body.push({ x: impulse.x, y: impulse.y, z: impulse.z });
    }

    /**
     * Shoves the entity: vanilla's rule is that each shove halves whatever motion the last one
     * left before adding its own, which is what makes a sprint hit both throw harder and cancel
     * more of the run the target was making.
     */
    public applyKnockback(directionX: number, directionZ: number, strength: number, damping = 0.5): void {
        const moving = this.entity.body;
        const carried = moving.velocity;
        moving.velocity = { x: carried.x * damping, y: carried.y, z: carried.z * damping };
        moving.push({ x: directionX * strength, y: KNOCKBACK_LIFT, z: directionZ * strength });
    }

    /** The `/tag` tags of the entity. */
    public getTags(): readonly string[] {
        return [...this.entity.body.tags];
    }

    /** Adds a `/tag` tag. @returns Whether the entity did not already carry it. */
    public addTag(tag: string): boolean {
        if (this.entity.body.tags.has(tag)) return false;
        this.entity.body.tags.add(tag);
        return true;
    }

    /** Takes a `/tag` tag off. @returns Whether the entity carried it. */
    public removeTag(tag: string): boolean {
        return this.entity.body.tags.delete(tag);
    }

    /** One active effect by its namespaced id or bare Bedrock name. */
    public getStatusEffect(identifier: string): StatusEffect | undefined {
        return this.entity.body.statusEffects.get(normalizeStatusEffectId(identifier));
    }

    /** Whether one status effect is active. */
    public hasStatusEffect(identifier: string): boolean {
        return this.getStatusEffect(identifier) !== undefined;
    }

    /**
     * Applies or refreshes a status effect in the store, unless the entity's
     * `minecraft:mob_effect_immunity` refuses it, merging with an effect already running.
     *
     * @param notify - Whether to tell clients about an accepted change.
     * @returns Whether the effect changed.
     */
    public addStatusEffect(input: StatusEffectInput, notify = true): boolean {
        const id = normalizeStatusEffectId(input.id);
        if (bedrockMobEffectId(id) === undefined || !acceptsStatusEffect(this.entity.instance, id)) return false;
        const effects = this.entity.body.statusEffects;
        const change = mergeStatusEffect(effects, input);
        if (change === undefined) return false;
        const effect = effects.get(id);
        if (effect !== undefined && notify) this.announceStatusEffect(effect, change);
        return true;
    }

    /** Removes one status effect. @returns Whether an active effect was removed. */
    public removeStatusEffect(identifier: string, notify = true): boolean {
        const previous = removeStatusEffectFromMap(this.entity.body.statusEffects, identifier);
        if (previous === undefined) return false;
        if (notify) this.announceStatusEffect(previous, 'remove');
        return true;
    }

    /** Removes every active status effect. @returns How many were cleared. */
    public clearStatusEffects(notify = true): number {
        let cleared = 0;
        for (const effect of this.getStatusEffects()) {
            if (this.removeStatusEffect(effect.id, notify)) cleared += 1;
        }
        return cleared;
    }

    private announceStatusEffect(effect: StatusEffect, change: StatusEffectChange): void {
        void this.world
            .sendStatusEffect(this, effect, change)
            .catch((error: unknown) => this.getServer().getLogger().error(error));
    }

    /** Ticks a non-player entity waits in a portal before it goes through, which is none. */
    public getPortalTransitionTicks(_rule?: PortalRule): number {
        return PORTAL_TRANSITION_TICKS.other;
    }

    /** How long the entity refuses portals after a dimension change. */
    public getDefaultPortalCooldown(): number {
        return PORTAL_COOLDOWN_TICKS.entity;
    }

    /** Ticks left before the entity may enter a portal again. */
    public getPortalCooldown(): number {
        return this.portalCooldown;
    }

    /** Starts the portal cooldown, on arrival through a portal. */
    public setPortalCooldown(ticks: number = this.getDefaultPortalCooldown()): void {
        this.portalCooldown = portalCooldownOf(ticks);
    }

    /** Whether the entity still refuses portals after a recent dimension change. */
    public isOnPortalCooldown(): boolean {
        return this.getPortalCooldown() > 0;
    }

    /**
     * Whether the portal cooldown waits this tick instead of counting down. A plain entity's never
     * waits.
     */
    protected holdsPortalCooldown(): boolean {
        return false;
    }

    /** The portal the entity is in contact with, if any. */
    public portalContact(): PortalContact | undefined {
        return this.portalContactState;
    }

    /**
     * Records that the entity overlaps a portal block this tick: a touch on cooldown winds the
     * cooldown back instead of opening a contact.
     */
    public touchPortal(at: Vector3, portal?: PortalBlockRef): void {
        if (this.isOnPortalCooldown()) {
            this.setPortalCooldown();
            return;
        }
        this.portalContactState ??= new PortalContact(at);
        this.portalContactState.touch(at, portal);
    }

    /** Claims the entity's one update of a server tick, so a world that ticks it twice runs it once. */
    public claimUpdate(tick: number): boolean {
        if (this.lastUpdatedTick === tick) return false;
        this.lastUpdatedTick = tick;
        return true;
    }

    /**
     * The part of a tick the store does not run yet: the portal clock, a trip through a portal
     * once the contact is ready, and the status effects, whose harm and healing go through the
     * store.
     */
    public async update(_tick: number): Promise<void> {
        const cooldown = this.getPortalCooldown();
        if (cooldown > 0 && !this.holdsPortalCooldown()) this.setPortalCooldown(cooldown - 1);

        const contact = this.portalContactState;
        if (contact !== undefined) {
            const portal = contact.getPortal();
            const rule = portal === undefined ? undefined : portalRuleOf(portal.block);
            const ready = contact.tick(this.getPortalTransitionTicks(rule));
            if (ready && portal !== undefined) {
                this.portalContactState = undefined;
                const travel = this.getServer().getDimensionTravel();
                const arrival = await travel.resolve(this, portal);
                if (arrival !== undefined) await travel.transfer(this, arrival);
            } else if (!ready && contact.hasExpired()) this.portalContactState = undefined;
        }

        this.statusEffectAge++;
        await tickStatusEffects({
            effects: this.entity.body.statusEffects,
            age: this.statusEffectAge,
            apply: (effect, clock) => this.applyStatusEffectTick(effect, clock),
            remove: (id) => this.removeStatusEffect(id)
        });
    }

    /** A status effect's harm as a blow through the store's pipeline, and its healing as a heal. */
    protected applyStatusEffectTick(effect: StatusEffect, clock: number): void {
        const health = this.entity.instance.attributes.get('health');
        if (health === undefined) return;
        const change = effectHealthChange(effect.id, effect.amplifier, clock, health.current, health.max);
        if (change === undefined || change.amount <= 0) return;
        if (change.kind === 'heal') this.blows.heal(this.entity, change.amount);
        else this.blows.hurt(this.entity, change.amount, DamageSource.of(change.cause), 'status_effect');
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

/**
 * The type a saved actor no loaded pack declares is held under: the entity overlay's
 * `jsprismarine:inert_actor`, which has health and nothing else, so it stands still and runs no
 * behavior.
 */
export const INERT_ACTOR = 'jsprismarine:inert_actor';

/**
 * A saved actor whose type no loaded pack declares, held in the store as an inert entity.
 *
 * It reports the identifier it was saved with, so a client draws it as itself and the next save
 * writes it back under that identifier, with the actor record tags it was loaded with. A world
 * loaded without the Bedrock pack keeps every mob this way instead of losing it.
 */
export class InertActor extends StoreActor {
    /**
     * @param entity - The inert store entity.
     * @param world - The world it stands in.
     * @param blows - Where the actor sends the blows and heals the world code gives it.
     * @param savedType - The identifier the actor was saved with.
     */
    public constructor(
        entity: DataEntity,
        world: World,
        blows: StoreActorBlows,
        private readonly savedType: string
    ) {
        super(entity, world, undefined, blows);
    }

    /** The identifier the actor was saved with, not the inert type that holds it. */
    public override getType(): string {
        return this.savedType;
    }

    /** The box of the saved type, which is the default box for a type no pack declares. */
    public override getBox(): EntityBox {
        return boxOf(this.getServer().getContent().entities.registry, this.savedType);
    }
}

/** What {@link StoreActors} is built over. */
export interface StoreActorsOptions {
    /** The live world, read at call time, because the runtime outlives any one world load. */
    world(): World | undefined;
    /** Receives everything the actors met and could not carry out. */
    report(message: string): void;
    /** Where each actor sends the blows and heals the rest of the server gives it. */
    readonly blows: StoreActorBlows;
    /**
     * The actor of a store player, which `entity/data/storePlayers.ts` builds from the player's
     * profile, or undefined for any other entity, which gets a plain {@link StoreActor}.
     */
    playerActor?(entity: DataEntity, world: World, blows: StoreActorBlows): StoreActor | undefined;
    /**
     * The actor of a dropped stack or of a saved actor no pack declares, which
     * `entity/data/live.ts` builds, or undefined for an entity that gets a plain {@link StoreActor}.
     */
    builtInActor?(entity: DataEntity, world: World, blows: StoreActorBlows): StoreActor | undefined;
}

/** The actors of one dimension's store, one per entity. */
export class StoreActors {
    private readonly actors = new Map<number, StoreActor>();
    /** See {@link StoreActors.droppedItemCount}. */
    private droppedItems = 0;

    public constructor(private readonly options: StoreActorsOptions) {}

    /** The actor of one store entity, or undefined when it has none. */
    public actorOf(id: number): StoreActor | undefined {
        return this.actors.get(id);
    }

    /** Every actor, in the order the store made them. */
    public all(): MapIterator<StoreActor> {
        return this.actors.values();
    }

    /** How many actors there are, which is what a test counts. */
    public get size(): number {
        return this.actors.size;
    }

    /** How many of the actors are dropped stacks, which is how many lie in the world. */
    public get droppedItemCount(): number {
        return this.droppedItems;
    }

    /** Shows a store entity the runtime just made to the clients in range. */
    public add(entity: DataEntity, leashHolderId?: number): void {
        const world = this.options.world();
        if (world === undefined) return;

        const actor =
            this.options.playerActor?.(entity, world, this.options.blows) ??
            this.options.builtInActor?.(entity, world, this.options.blows) ??
            new StoreActor(entity, world, leashHolderId, this.options.blows);
        // After the constructor, so an actor that reads its equipment elsewhere has been built.
        actor.writeEquipment(world.getServer().getContent());
        this.actors.set(entity.id, actor);
        if (isDroppedItem(entity)) this.droppedItems++;
        void world.showActor(actor).catch((error: unknown) => this.failed('show', error));
    }

    /** Takes a store entity the runtime removed off every client that was shown it. */
    public remove(entity: DataEntity): void {
        const actor = this.actors.get(entity.id);
        this.actors.delete(entity.id);
        if (actor === undefined) return;
        if (isDroppedItem(entity)) this.droppedItems--;

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

        for (const entity of runtime.entities()) {
            const actor = this.actors.get(entity.id);
            if (actor === undefined) continue;
            const isTicking = shouldSync === undefined || shouldSync(entity.position);

            const health = entity.instance.attributes.get('health');
            if (health !== undefined) actor.showHealth(health.current);
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
                    const projection = actor.projectMetadata(leashHolderId);
                    metadataChanged = !sameActorMetadataProjection(actor.shownProjection, projection);
                    if (metadataChanged) {
                        applyActorMetadataProjection(actor, projection);
                        actor.shownProjection = projection;
                    }
                }
            }

            // After the projection, which knows nothing of what a player's components keep.
            if (actor.showPlayerState()) metadataChanged = true;

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
        this.droppedItems = 0;
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
