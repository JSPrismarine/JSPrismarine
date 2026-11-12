/**
 * The store's entities, as the rest of the server reaches them.
 *
 * Every entity in the store gets one {@link StoreActor}, a {@link ShownActor} that answers from
 * the store: its position, rotation and velocity from the body, its health from the instance, its
 * equipment from the body's drops, and its metadata from the actor metadata projection, each read
 * when asked. What other clients are shown of an entity is not read here: replication sends it
 * from the change log ([ADR 0016](../../../../../docs/adr/0016-replication-reads-the-change-log.md),
 * `network/replica/EntityReplication.ts`).
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
 * does not model yet: the portal clock. Slice 9 of the entity and tick re-architecture takes it
 * over, with travel as messages. The actor record tags a save carries forward and the clock of
 * the status effects are logged fields of the entity's body, so replication can read them from
 * the change log.
 */
import { Vector3 } from '@jsprismarine/math';
import type { EntityPosition } from '@jsprismarine/entities';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import type { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import { Metadata } from '@jsprismarine/protocol/wire/structures/Metadata';
import type { SyncedProperties } from '@jsprismarine/protocol/wire/structures/SyncedProperties';

import { syncedPropertiesOf } from '../../network/actorProperties';
import type Server from '../../Server';
import type { PortalBlockRef } from '../../world/portal/DimensionTravel';
import { portalRuleOf } from '../../world/portal/rules';
import type { PortalRule } from '../../world/portal/rules';
import type { ShownActor } from '../../world/ShownActor';
import type { World } from '../../world/World';
import { DamageCause } from '../DamageCause';
import { DamageSource } from '../DamageSource';
import { viewableEquipmentOf } from '../equipment';
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
import { nbtBytesOf, nbtOfBytes } from '../../nbtBytes';
import { healthAttributesOf } from './actorView';
import type { DataEntity, StatusEffectClock } from './DataEntity';
import type { DamageRoute } from './damagePipeline';
import { isDroppedItem } from './droppedItems';
import { acceptsStatusEffect } from './EntityRuntime';
import type { EntityBox } from './facts';
import { boxOf } from './facts';
import { actorMetadataProjection, applyActorMetadataProjection } from './actorMetadata';
import type { ActorMetadataProjection } from './actorMetadata';

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
 * One store entity as the network layer and the rest of the server read it, from the store on
 * every call.
 */
export class StoreActor implements ShownActor {
    private portalCooldown = 0;
    private portalContactState: PortalContact | undefined;
    private lastUpdatedTick = -1;
    /** The tick of the last update that advanced the status effect clock, or -1 before the first. */
    private clockTick = -1;

    /** The attributes the actor holds, whose health {@link StoreActor.attributes} brings up to the store's. */
    protected readonly heldAttributes: Attributes;

    public constructor(
        /** The store entity behind the actor. */
        public readonly entity: DataEntity,
        private readonly world: World,
        private readonly blows: StoreActorBlows
    ) {
        this.heldAttributes = healthAttributesOf(entity.instance.attributes.get('health'));
    }

    /**
     * The actor metadata the store state projects to now, with the type's box: what a player's
     * own client and a save read. It leaves out who holds the entity's leash, which only other
     * clients are shown, and they are sent the replica's metadata.
     */
    public get metadata(): Metadata {
        const metadata = new Metadata();
        const { width, height } = boxOf(this.getServer().getContent().entities.registry, this.entity.identifier);
        metadata.setBoundingBox(width, height);
        applyActorMetadataProjection({ metadata }, this.projectMetadata());
        return metadata;
    }

    /**
     * The actor's attributes, with the store's health and its maximum now, which a save and the
     * replay digest read.
     */
    public get attributes(): Attributes {
        const health = this.entity.instance.attributes.get('health');
        const shown = healthAttributesOf(health).getAttribute(AttributeIds.Health);
        if (health !== undefined && shown !== null) this.heldAttributes.setAttribute(shown);
        return this.heldAttributes;
    }

    /**
     * The actor record tags this server does not model, which the next save writes back, such
     * as the actor's `UniqueID`. A save writes the entity's record into them first.
     *
     * They are kept in the store, as network NBT bytes in a logged field, so this answers a new
     * compound on every read: change one by assigning it back.
     */
    public get persistentNbt(): NBTTagCompound | null {
        const tags = this.entity.body.actorTags;
        return tags === undefined ? null : nbtOfBytes(tags);
    }

    public set persistentNbt(tags: NBTTagCompound | null) {
        this.entity.body.actorTags = tags === null ? undefined : nbtBytesOf(tags);
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
     * The actor metadata the store state projects to, which {@link StoreActor.metadata} writes.
     * @param leashHolderId - The runtime id of whatever holds the entity's leash.
     */
    public projectMetadata(leashHolderId?: number): ActorMetadataProjection {
        return actorMetadataProjection(this.entity, leashHolderId);
    }

    /** @inheritdoc */
    public getSyncedProperties(): SyncedProperties {
        return syncedPropertiesOf(this.entity.instance.properties);
    }

    /** @inheritdoc */
    public getEquipment(): ViewableEquipment {
        return viewableEquipmentOf(this.entity.equipment, this.getServer().getContent());
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
        this.world.sendStatusEffect(this, effect, change);
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
     * The part of a tick the store does not run yet: the portal clock, the start of a trip
     * through a portal once the contact is ready, and the status effects, whose harm and healing go through the
     * store.
     */
    public update(tick: number): void {
        const cooldown = this.getPortalCooldown();
        if (cooldown > 0 && !this.holdsPortalCooldown()) this.setPortalCooldown(cooldown - 1);

        const contact = this.portalContactState;
        if (contact !== undefined) {
            const portal = contact.getPortal();
            const rule = portal === undefined ? undefined : portalRuleOf(portal.block);
            const ready = contact.tick(this.getPortalTransitionTicks(rule));
            if (ready && portal !== undefined) {
                this.portalContactState = undefined;
                // A message: the destination lands the trip in its input step, and this tick
                // does not wait for it to be built or loaded.
                this.getServer().getDimensionTravel().depart(this, portal);
            } else if (!ready && contact.hasExpired()) this.portalContactState = undefined;
        }

        const age = this.advanceStatusEffectClock(tick);
        tickStatusEffects({
            effects: this.entity.body.statusEffects,
            age,
            apply: (effect, clock) => this.applyStatusEffectTick(effect, clock),
            remove: (id) => this.removeStatusEffect(id)
        });
    }

    /**
     * Advances the status effect clock by this update and reads it. The clock counts the
     * entity's updates from its first one, and the store holds it as its reading at one update
     * ({@link StatusEffectClock}), so only the first update and one after a gap write it.
     * @returns The clock after this update.
     */
    private advanceStatusEffectClock(tick: number): number {
        const { body } = this.entity;
        const anchor = body.statusEffectClock;
        const last = this.clockTick;
        this.clockTick = tick;
        if (anchor !== undefined && last === tick - 1) return anchor.age + (tick - anchor.tick);

        const age = anchor === undefined || last === -1 ? 1 : anchor.age + (last - anchor.tick) + 1;
        body.statusEffectClock = { age, tick };
        return age;
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
        super(entity, world, blows);
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

    /**
     * Gives a store entity the runtime just made its actor. Clients are shown it from its
     * entering entry in the change log.
     */
    public add(entity: DataEntity): void {
        const world = this.options.world();
        if (world === undefined) return;

        const actor =
            this.options.playerActor?.(entity, world, this.options.blows) ??
            this.options.builtInActor?.(entity, world, this.options.blows) ??
            new StoreActor(entity, world, this.options.blows);
        this.actors.set(entity.id, actor);
        if (isDroppedItem(entity)) this.droppedItems++;
    }

    /**
     * Forgets the actor of a store entity the runtime removed. Clients are told from its leaving
     * entry in the change log.
     */
    public remove(entity: DataEntity): void {
        const actor = this.actors.get(entity.id);
        this.actors.delete(entity.id);
        if (actor !== undefined && isDroppedItem(entity)) this.droppedItems--;
    }

    /** Forgets every actor, for a world that is closing. */
    public clear(): void {
        this.actors.clear();
        this.droppedItems = 0;
    }
}
