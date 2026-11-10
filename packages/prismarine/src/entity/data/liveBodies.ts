/**
 * The body a client is sent for each data-driven entity.
 *
 * A {@link DataEntity} is a component set and a position. It is not an
 * {@link Entity}, so nothing tracks it, nothing serializes it and no client
 * ever hears about it. This index closes that gap: one {@link GenericEntity}
 * per data entity, added to the live world when the runtime announces a spawn
 * and taken out again when it announces a removal.
 *
 * `GenericEntity` and not a class per species, and the distinction is the
 * whole point. A `Zombie` ran `Mob.update`, which ran the legacy goal set and
 * the legacy physics, and two systems steering one body fought each other
 * every tick. `GenericEntity` inherits `Entity.update`, which only runs the
 * invulnerability timer down, so the data runtime is the only thing driving
 * it. The client draws a Bedrock mob from its identifier either way.
 *
 * Health crosses in one direction. The runtime's `minecraft:health` attribute is the truth, and
 * the body shows it. A blow that reaches a body through the legacy damage pipeline, such as
 * `Entity.damage` or a written health, is handed to the store's damage pipeline as an intent
 * and the body's own pipeline never runs, so loot, death and retaliation happen in one place.
 */
import { Vector3 } from '@jsprismarine/math';
import { isRecord } from '@jsprismarine/entities';
import type { EntityPosition } from '@jsprismarine/entities';
import { NBTTagCompound } from '@jsprismarine/nbt';

import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import { syncedPropertiesOf } from '../../network/actorProperties';
import { Attribute, AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import { DamageCause } from '../DamageCause';
import { DamageSource } from '../DamageSource';
import { viewableEquipmentOf } from '../equipment';
import type { Entity } from '../Entity';
import type { StatusEffect } from '../StatusEffect';
import { normalizeStatusEffectId } from '../StatusEffect';
import { effectHealthChange } from '../StatusEffectTick';
import type { DamageRoute } from './damagePipeline';
import { GenericEntity } from '../GenericEntity';
import { KNOCKBACK_LIFT } from '../knockback';
import type { DataEntity } from './DataEntity';
import type { EntityRuntime } from './EntityRuntime';
import { applyActorMetadataProjection } from './actorMetadata';
import type { ActorMetadataProjection } from './actorMetadata';
import type { DataEntityRecord } from './persistence';
import { dataEntityRecordOf, writeDataEntityRecord } from './persistence';

/**
 * The body of one data-driven entity.
 *
 * A plain {@link GenericEntity} in every respect but the shove. A blow that arrives through the
 * legacy damage pipeline - a player's sword, a blast - calls `applyKnockback`, and the base
 * entity ignores it because it has nothing to spend the impulse on. The entity behind the body
 * does: `MobBody.velocity` is the same field the leap and charge goals write, and the runtime
 * integrates it against the blocks. Without this a sword took a mob's health away and left it
 * standing exactly where it was.
 */
class DataEntityBody extends GenericEntity {
    public constructor(
        private readonly driver: DataEntity,
        options: {
            identifier: string;
            position: Position;
            pitch?: number;
            yaw?: number;
            headYaw?: number;
            attributes?: Attribute[];
            runtimeId: bigint;
        },
        private readonly blows: LiveBodyBlows
    ) {
        super(options);
    }

    /** The store's health, which is the only copy there is. */
    public override getHealth(): number {
        return this.driver.instance.attributes.get('health')?.current ?? super.getHealth();
    }

    /** The store's maximum health. */
    public override getMaxHealth(): number {
        return this.driver.instance.attributes.get('health')?.max ?? super.getMaxHealth();
    }

    /**
     * Hands the blow to the store's damage pipeline, which decides it and applies it before this
     * returns. The legacy pipeline in {@link Entity.damage} never runs for a data-driven entity.
     */
    public override async damage(
        amount: number,
        source: DamageCause | DamageSource = DamageCause.Generic
    ): Promise<boolean> {
        if (amount <= 0) return false;
        return this.blows.hurt(amount, DamageSource.of(source), 'legacy_body');
    }

    /**
     * A status effect's harm, such as Poison or Wither, as a blow through the store's pipeline,
     * and its healing, such as Regeneration, as a heal in the store.
     */
    protected override async applyStatusEffectTick(effect: StatusEffect, clock: number): Promise<void> {
        const health = this.driver.instance.attributes.get('health');
        if (health === undefined) return;
        const change = effectHealthChange(effect.id, effect.amplifier, clock, health.current, health.max);
        if (change === undefined || change.amount <= 0) return;
        if (change.kind === 'heal') this.blows.heal(change.amount);
        else this.blows.hurt(change.amount, DamageSource.of(change.cause), 'status_effect');
    }

    /**
     * A health written onto the body is a change to the store's health: a lower one, which is
     * what `/kill` writes, is a blow for the difference through the same pipeline, and a higher
     * one is a heal.
     */
    public override async setHealth(
        health: number,
        source: DamageCause | DamageSource = DamageCause.Generic
    ): Promise<void> {
        const current = this.driver.instance.attributes.get('health')?.current;
        if (current === undefined || health === current) return;
        if (health > current) this.blows.heal(health - current);
        else this.blows.written(current - health, DamageSource.of(source));
    }

    /** Heals the entity in the store, where its health is. */
    public override async heal(amount: number): Promise<boolean> {
        return this.blows.heal(amount);
    }

    /** Adds the impulse to the entity body the runtime integrates each tick. */
    public override applyImpulse(impulse: EntityPosition): void {
        this.driver.body.push({ x: impulse.x, y: impulse.y, z: impulse.z });
    }

    /** @inheritdoc */
    public override getSyncedProperties() {
        return syncedPropertiesOf(this.driver.instance.properties);
    }

    /** @inheritdoc */
    protected override statusEffectMap(): Map<string, StatusEffect> {
        return this.driver.body.statusEffects;
    }

    /** @inheritdoc */
    protected override acceptsStatusEffect(identifier: string): boolean {
        const immunity = this.driver.instance.componentParams('minecraft:mob_effect_immunity');
        if (!isRecord(immunity) || !Array.isArray(immunity.mob_effects)) return true;
        return !immunity.mob_effects.some(
            (effect) => typeof effect === 'string' && normalizeStatusEffectId(effect) === identifier
        );
    }

    /** @inheritdoc */
    public override getTrackingInterval(): number {
        return this.driver.instance.hasComponent('minecraft:projectile') ? 1 : super.getTrackingInterval();
    }

    /** @inheritdoc */
    public override getVelocity(): Vector3 {
        return Vector3.fromObject(this.driver.body.velocity);
    }

    /** @inheritdoc */
    public override shouldPersist(): boolean {
        return !this.driver.instance.hasComponent('minecraft:transient');
    }

    /** @inheritdoc */
    public override addTag(tag: string): boolean {
        if (this.driver.body.tags.has(tag)) return false;
        this.driver.body.tags.add(tag);
        return true;
    }

    /** @inheritdoc */
    public override removeTag(tag: string): boolean {
        return this.driver.body.tags.delete(tag);
    }

    /** @inheritdoc */
    public override getTags(): readonly string[] {
        return [...this.driver.body.tags];
    }

    /** @inheritdoc */
    public override applyKnockback(directionX: number, directionZ: number, strength: number, damping = 0.5): void {
        // The damping first, because vanilla's rule is that each shove halves whatever motion
        // the last one left before adding its own - which is what makes a sprint hit both throw
        // harder and cancel more of the run the target was making.
        const moving = this.driver.body;
        const carried = moving.velocity;
        moving.velocity = { x: carried.x * damping, y: carried.y, z: carried.z * damping };
        moving.push({ x: directionX * strength, y: KNOCKBACK_LIFT, z: directionZ * strength });
    }
}

/** Where a body sends the blows it receives through the legacy entity methods. */
interface LiveBodyBlows {
    /** A blow through {@link Entity.damage} or a status effect. */
    hurt(amount: number, source: DamageSource, route: DamageRoute): boolean;
    /** A lower health written through {@link Entity.setHealth}, by how much it is lower. */
    written(taken: number, source: DamageSource): void;
    /** A heal, which the store applies up to the entity's maximum. */
    heal(amount: number): boolean;
}

/** What {@link LiveBodies} is built over. */
export interface LiveBodiesOptions {
    /** The live world, read at call time, because the runtime outlives any one world load. */
    world(): World | undefined;
    /** Receives everything the mirror met and could not carry out. */
    report(message: string): void;
    /** Runs a legacy blow on a body through the store's damage pipeline. */
    hurt(entity: DataEntity, amount: number, source: DamageSource, route: DamageRoute): boolean;
    /** Runs a lower health written onto a body through the store's damage pipeline. */
    written(entity: DataEntity, taken: number, source: DamageSource): void;
    /** Heals a body's entity in the store. */
    heal(entity: DataEntity, amount: number): boolean;
}

/**
 * One legacy body per data-driven entity, for the legacy entity code that still reaches a store
 * entity through the world's entity map: commands, legacy blasts and swings, saves and portals.
 *
 * Clients are not shown these. `storeActors.ts` shows them each store entity from store state,
 * and {@link World.addEntity} announces no body. A body reads its health and damage from the
 * store, and {@link LiveBodies.sync} writes its position silently so the world's chunk
 * membership and the legacy queries follow the store. Slice 5 of the entity and tick
 * re-architecture deletes the bodies with the legacy classes.
 */
export class LiveBodies {
    /** Each body by its runtime id, which is its data entity's id as well. */
    private readonly bodies = new Map<number, Entity>();
    /** The value of `MobBody.equipmentRevision` last written onto each body. */
    private readonly equipped = new Map<number, number>();
    private readonly options: LiveBodiesOptions;

    public constructor(options: LiveBodiesOptions) {
        this.options = options;
    }

    /** The live body of one data entity, or undefined when it has none. */
    public bodyOf(id: number): Entity | undefined {
        return this.bodies.get(id);
    }

    /**
     * The data entity id for a legacy body, or undefined when it is not data-driven.
     *
     * A body carries its entity's id as its runtime id, so this is the runtime id of a body
     * this runtime holds.
     */
    public entityIdOf(body: Entity): number | undefined {
        const id = Number(body.getRuntimeId());
        return this.bodies.get(id) === body ? id : undefined;
    }

    /** How many bodies are in the world, which is what a test counts. */
    public get size(): number {
        return this.bodies.size;
    }

    /** Puts a body in the world's entity map for an entity the runtime just made. */
    public add(entity: DataEntity): void {
        const world = this.options.world();
        if (world === undefined) return;

        const at = entity.position;
        const health = entity.instance.attributes.get('health');
        const body = new DataEntityBody(
            entity,
            {
                identifier: entity.identifier,
                // The entity's own id: the runtime draws it from the same counter as every
                // other entity, so the mob has one id on the wire and in the runtime.
                runtimeId: BigInt(entity.id),
                position: Position.fromVector3(new Vector3(at.x, at.y, at.z), world),
                yaw: entity.body.yaw,
                headYaw: entity.body.yaw,
                pitch: entity.body.pitch,
                ...(health === undefined ? { attributes: [] } : {})
            },
            {
                hurt: (amount, source, route) => this.options.hurt(entity, amount, source, route),
                written: (taken, source) => this.options.written(entity, taken, source),
                heal: (amount) => this.options.heal(entity, amount)
            }
        );
        if (health !== undefined)
            body.attributes.setAttribute(
                new Attribute({
                    name: AttributeIds.Health,
                    min: 0,
                    max: health.max,
                    def: health.max,
                    value: health.current
                })
            );
        this.writeEquipment(entity, body);

        this.bodies.set(entity.id, body);
        void world.addEntity(body).catch((error: unknown) => this.failed('add', error));
    }

    /**
     * Writes an actor metadata projection onto a body, which a save reads a primed fuse from.
     * The store actor announces it; the body only carries it.
     */
    public project(entity: DataEntity, projection: ActorMetadataProjection): void {
        const body = this.bodies.get(entity.id);
        if (body !== undefined) applyActorMetadataProjection(body, projection);
    }

    /** Takes the body of an entity the runtime removed back out of the world. */
    public drop(entity: DataEntity): void {
        const body = this.bodies.get(entity.id);
        this.bodies.delete(entity.id);
        this.equipped.delete(entity.id);
        if (body === undefined) return;

        const world = this.options.world();
        if (world === undefined) return;
        void world.removeEntity(body).catch((error: unknown) => this.failed('remove', error));
    }

    /** Takes a body out of the indexes before its runtime entity is suspended for chunk unload. */
    public detach(body: Entity): number | undefined {
        const id = this.entityIdOf(body);
        if (id === undefined) return undefined;

        this.bodies.delete(id);
        this.equipped.delete(id);
        return id;
    }

    /**
     * Writes each entity's position, rotation, ground state, health and equipment onto its body,
     * after a tick of the runtime. Nothing is announced: clients hear about a store entity from
     * its store actor.
     *
     * @param runtime - The entity runtime whose entities the bodies stand in for.
     */
    public sync(runtime: EntityRuntime): void {
        for (const entity of runtime.all()) {
            const body = this.bodies.get(entity.id);
            if (body === undefined) continue;

            const health = entity.instance.attributes.get('health');
            if (health !== undefined) body.attributes.setValue(AttributeIds.Health, health.current);
            this.writeEquipment(entity, body);
            body.setGrounded(entity.body.conditions.has('on_ground'));
            body.pitch = entity.body.pitch;
            body.yaw = entity.body.yaw;
            body.headYaw = entity.body.yaw;

            const at = entity.position;
            const here = body.getPosition();
            if (here.getX() !== at.x || here.getY() !== at.y || here.getZ() !== at.z)
                body.restorePosition(new Position(at.x, at.y, at.z, body.getWorld()));
        }
    }

    /**
     * Writes each entity's component state onto the body a save reads.
     *
     * Called from the save rather than from the tick: the record is a snapshot
     * of state that changes every tick, and building one per entity per tick
     * would be work nothing reads until a chunk is written. The chunk
     * serializer picks it up from `Entity.persistentNbt` with every other tag
     * the actor carries.
     */
    public persist(runtime: EntityRuntime): void {
        for (const [body, record] of this.records(runtime)) {
            body.persistentNbt ??= new NBTTagCompound('');
            writeDataEntityRecord(body.persistentNbt, record);
        }
    }

    /**
     * The record {@link LiveBodies.persist} would write onto each body that persists, without
     * writing it, so a replay digest can hash what a save holds and leave every body as it was.
     */
    public records(runtime: EntityRuntime): Map<Entity, DataEntityRecord> {
        const records = new Map<Entity, DataEntityRecord>();
        for (const entity of runtime.all()) {
            const body = this.bodies.get(entity.id);
            if (body === undefined || !body.shouldPersist()) continue;
            records.set(
                body,
                dataEntityRecordOf(
                    entity,
                    runtime.poolOf(entity.id),
                    runtime.leashHolderIdentityOf(entity.id),
                    runtime.merchantSnapshotOf(entity)
                )
            );
        }
        return records;
    }

    /** Forgets every body, for a world that is closing. */
    public clear(): void {
        this.bodies.clear();
        this.equipped.clear();
    }

    /** Writes a data entity's equipment onto its body as items, when its revision moved. */
    private writeEquipment(entity: DataEntity, body: Entity): void {
        if (this.equipped.get(entity.id) === entity.body.equipmentRevision) return;
        this.equipped.set(entity.id, entity.body.equipmentRevision);

        const content = this.options.world()?.getServer().getContent();
        if (content !== undefined) body.setEquipment(viewableEquipmentOf(entity.equipment, content));
    }

    private failed(what: string, error: unknown): void {
        this.options.report(`could not ${what} the body of a data-driven entity: ${String(error)}`);
    }
}
