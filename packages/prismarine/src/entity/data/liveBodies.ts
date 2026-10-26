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
 * Health crosses in both directions, because both sides can change it. The
 * runtime's `minecraft:health` attribute is the truth; a blow that arrived
 * through the legacy damage pipeline - a player swinging at the body - shows
 * up here as the live health having dropped below what was last written, and
 * that difference is handed back to the runtime so the loot, the death and
 * the retaliation all happen in one place.
 */
import { Vector3 } from '@jsprismarine/math';
import { ActorFlags } from '@jsprismarine/minecraft/ActorFlags';
import { NBTTagCompound } from '@jsprismarine/nbt';
import { navigationProfile } from '@jsprismarine/entity-goals';

import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import { itemOfDrop } from '../../inventory/persistence';
import { sameSyncedProperties, syncedPropertiesOf } from '../../network/actorProperties';
import { Attribute, AttributeIds } from '../Attribute';
import { MOB_EQUIPMENT_SLOTS, sameEquipmentItems } from '../equipment';
import type { ViewableEquipment } from '../predicateView';
import type { Entity } from '../Entity';
import { GenericEntity } from '../GenericEntity';
import type { DataEntity } from './DataEntity';
import type { EntityRuntime } from './EntityRuntime';
import { dataEntityRecordOf, writeDataEntityRecord } from './persistence';

/** How far an entity has to move before the movement is worth putting on the wire, in blocks. */
const MOVEMENT_EPSILON = 1e-4;

/**
 * How far up a shove lifts, in blocks per tick.
 *
 * Vanilla's cap, which is what a hit from a standing start produces. The runtime's gravity is
 * what brings the entity back down, so this is only the first tick of the arc.
 */
const KNOCKBACK_LIFT = 0.4;

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
        options: { identifier: string; position: Position; pitch?: number; yaw?: number; headYaw?: number }
    ) {
        super(options);
    }

    /** @inheritdoc */
    public override getSyncedProperties() {
        return syncedPropertiesOf(this.driver.instance.properties);
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

/** What {@link LiveBodies} is built over. */
export interface LiveBodiesOptions {
    /** The live world, read at call time, because the runtime outlives any one world load. */
    world(): World | undefined;
    /** Receives everything the mirror met and could not carry out. */
    report(message: string): void;
}

/** One live body per data-driven entity, kept in step with it. */
export class LiveBodies {
    private readonly bodies = new Map<number, Entity>();
    private readonly idsByBody = new Map<Entity, number>();
    /** The health last written onto each body, which is how a legacy blow is noticed. */
    private readonly written = new Map<number, number>();
    /** The property values last sent for each body. */
    private readonly synced = new Map<number, ReturnType<Entity['getSyncedProperties']>>();
    /**
     * The value of `MobBody.equipmentRevision` last mirrored onto each body.
     *
     * The cheap half of the guard. Comparing a counter is what keeps a tick in which nothing
     * was equipped from building five items per mob only to find they match; the byte-level
     * comparison in {@link LiveBodies.writeEquipment} is what then keeps a write that set the
     * same thing back from reaching the wire.
     */
    private readonly equipped = new Map<number, number>();
    /** Swimming flags last mirrored to each body's actor metadata. */
    private readonly movementFlags = new Map<number, { readonly canSwim: boolean; readonly swimming: boolean }>();
    private readonly options: LiveBodiesOptions;

    public constructor(options: LiveBodiesOptions) {
        this.options = options;
    }

    /** The live body of one data entity, or undefined when it has none. */
    public bodyOf(id: number): Entity | undefined {
        return this.bodies.get(id);
    }

    /** How many bodies are in the world, which is what a test counts. */
    public get size(): number {
        return this.bodies.size;
    }

    /**
     * Puts a body in the world for an entity the runtime just made.
     *
     * The maximum health is the type's rather than `Attributes.getDefaults`'
     * twenty, so a client draws a ten-health cow with five hearts instead of
     * with two and a half.
     */
    public add(entity: DataEntity): void {
        const world = this.options.world();
        if (world === undefined) return;

        const at = entity.position;
        const body = new DataEntityBody(entity, {
            identifier: entity.identifier,
            position: Position.fromVector3(new Vector3(at.x, at.y, at.z), world),
            yaw: entity.body.yaw,
            headYaw: entity.body.yaw,
            pitch: entity.body.pitch
        });

        const health = entity.instance.attributes.get('health');
        if (health !== undefined) {
            body.attributes.setAttribute(
                new Attribute({
                    name: AttributeIds.Health,
                    min: 0,
                    max: health.max,
                    def: health.max,
                    value: health.current
                })
            );
            this.written.set(entity.id, health.current);
        }

        // Before the world hears about it, so the `AddActorPacket` a client is sent is followed
        // by the equipment rather than by nothing. `sendAddActor` reads the body's equipment
        // straight after the spawn, and a bow written a tick later would be a visible flicker of
        // an empty-handed skeleton.
        this.writeEquipment(entity, body);
        this.writeMovementFlags(entity, body);

        this.bodies.set(entity.id, body);
        this.idsByBody.set(body, entity.id);
        this.synced.set(entity.id, body.getSyncedProperties());
        void world.addEntity(body).catch((error: unknown) => this.failed('add', error));
    }

    /** Takes the body of an entity the runtime removed back out of the world. */
    public drop(entity: DataEntity): void {
        const body = this.bodies.get(entity.id);
        this.bodies.delete(entity.id);
        this.written.delete(entity.id);
        this.synced.delete(entity.id);
        this.equipped.delete(entity.id);
        this.movementFlags.delete(entity.id);
        if (body === undefined) return;
        this.idsByBody.delete(body);

        const world = this.options.world();
        if (world === undefined) return;
        void world.removeEntity(body).catch((error: unknown) => this.failed('remove', error));
    }

    /** Takes a body out of the indexes before its runtime entity is suspended for chunk unload. */
    public detach(body: Entity): number | undefined {
        const id = this.idsByBody.get(body);
        if (id === undefined) return undefined;

        this.idsByBody.delete(body);
        this.bodies.delete(id);
        this.written.delete(id);
        this.synced.delete(id);
        this.equipped.delete(id);
        this.movementFlags.delete(id);
        return id;
    }

    /**
     * Brings every body back in step with its entity, after a tick of the
     * runtime.
     *
     * Damage first and position second. A blow that landed this tick has to
     * reach the runtime before the loot and the removal it may cause, and a
     * body that is removed has no position left to send.
     *
     * @returns The movement broadcasts, which the caller awaits with the rest
     *   of its tick.
     */
    public sync(runtime: EntityRuntime): readonly Promise<void>[] {
        const moves: Promise<void>[] = [];

        for (const entity of runtime.all()) {
            const body = this.bodies.get(entity.id);
            if (body === undefined) continue;

            this.takeLegacyDamage(runtime, entity, body);
            // Removed by the damage above, in which case its body has gone with it.
            if (!this.bodies.has(entity.id)) continue;

            this.showHealth(entity, body);
            this.writeEquipment(entity, body);
            const movementFlagsChanged = this.writeMovementFlags(entity, body);
            const properties = this.showSyncedProperties(entity, body);
            if (properties !== undefined) moves.push(properties);
            else if (movementFlagsChanged) {
                const metadata = this.options.world()?.sendActorMetadata(body);
                if (metadata !== undefined) moves.push(metadata);
            }
            const move = this.showPosition(entity, body);
            if (move !== undefined) moves.push(move);
        }

        return moves;
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
        for (const entity of runtime.all()) {
            const body = this.bodies.get(entity.id);
            if (body === undefined) continue;

            body.persistentNbt ??= new NBTTagCompound('');
            writeDataEntityRecord(body.persistentNbt, dataEntityRecordOf(entity, runtime.poolOf(entity.id)));
        }
    }

    /** Forgets every body, for a world that is closing. */
    public clear(): void {
        this.bodies.clear();
        this.idsByBody.clear();
        this.written.clear();
        this.synced.clear();
        this.equipped.clear();
        this.movementFlags.clear();
    }

    /**
     * Hands the runtime whatever the legacy damage pipeline took off the body.
     *
     * The source travels with it, so a player who hits a zombie is who the
     * zombie's `hurt_by_target` goes after.
     */
    private takeLegacyDamage(runtime: EntityRuntime, entity: DataEntity, body: Entity): void {
        const expected = this.written.get(entity.id);
        if (expected === undefined) return;

        const taken = expected - body.getHealth();
        if (taken <= 0) return;

        const source = body.getLastDamageSource();
        const attacker = source?.attacker;
        runtime.hurt(
            entity,
            attacker === null || attacker === undefined ? undefined : Number(attacker.getRuntimeId()),
            source?.cause ?? 'generic',
            taken
        );
    }

    /** Writes the runtime's health onto the body, where the attribute flush will find it. */
    private showHealth(entity: DataEntity, body: Entity): void {
        const health = entity.instance.attributes.get('health');
        if (health === undefined) return;

        body.attributes.setValue(AttributeIds.Health, health.current);
        this.written.set(entity.id, health.current);
    }

    /** Sends a property delta when the runtime changed a client-synced value. */
    private showSyncedProperties(entity: DataEntity, body: Entity): Promise<void> | undefined {
        const current = body.getSyncedProperties();
        const previous = this.synced.get(entity.id);
        if (previous !== undefined && sameSyncedProperties(previous, current)) return undefined;

        this.synced.set(entity.id, current);
        const world = this.options.world();
        return world?.sendActorMetadata(body);
    }

    /** Writes data-driven swim capabilities and the current swimming state to the actor. */
    private writeMovementFlags(entity: DataEntity, body: Entity): boolean {
        const profile = navigationProfile(entity.instance);
        const canSwim =
            profile.canSwim ||
            profile.canFloat ||
            profile.isAmphibious ||
            entity.instance.hasComponent('minecraft:behavior.float');
        const next = { canSwim, swimming: canSwim && entity.body.conditions.has('in_water') };
        const previous = this.movementFlags.get(entity.id);
        if (previous?.canSwim === next.canSwim && previous.swimming === next.swimming) return false;

        body.metadata.setGenericFlag(ActorFlags.CANSWIM, next.canSwim);
        body.metadata.setGenericFlag(ActorFlags.SWIMMING, next.swimming);
        this.movementFlags.set(entity.id, next);
        return previous !== undefined;
    }

    /**
     * The one way a data entity's equipment is written onto the body a client sees.
     *
     * The same shape as `blockentity/blockEntityWrite.ts`, and for the same reason: every write
     * site funnels through here, and a write whose bytes match what is already on the body is
     * dropped before anything is told about it. Three sites reach it - the spawn roll, a goal
     * putting something in a mob's hand, and a restore replaying a saved one - and the third is
     * the one the guard pays for, because a save holds exactly what the roll already produced.
     *
     * Two guards, cheapest first. The revision counter answers "has anything been written at
     * all", which on a steady tick is false for every entity in the world, so nothing is built.
     * When it has moved, the items are built and compared as the bytes they would be sent as,
     * which is the form that decides whether a client would see any difference.
     *
     * Reported rather than sent: `World.entityEquipmentChanged` decides who is holding this
     * entity and puts it on their connections. Nothing is reported for a body that is not in
     * the world yet, because `sendAddActor` carries the equipment itself.
     */
    private writeEquipment(entity: DataEntity, body: Entity): void {
        if (this.equipped.get(entity.id) === entity.body.equipmentRevision) return;
        this.equipped.set(entity.id, entity.body.equipmentRevision);

        const world = this.options.world();
        const content = world?.getServer().getContent();
        if (world === undefined || content === undefined) return;

        const worn: ViewableEquipment = {};
        for (const slot of MOB_EQUIPMENT_SLOTS) {
            const drop = entity.equipment[slot];
            if (drop === undefined) continue;

            const item = itemOfDrop(drop, content);
            if (item !== null) worn[slot] = item;
        }

        if (sameEquipmentItems(body.getEquipment(), worn)) return;

        body.setEquipment(worn);
        // Only for a body already in the world. The spawn path writes before `addEntity`, so
        // `this.bodies` not holding it yet is exactly "the clients have not been told it
        // exists", and `sendAddActor` is what tells them, equipment included.
        if (this.bodies.has(entity.id)) world.entityEquipmentChanged(body);
    }

    /** Moves the body to where the runtime put the entity, when that is anywhere new. */
    private showPosition(entity: DataEntity, body: Entity): Promise<void> | undefined {
        // Before the early return, because a mob that landed this tick without moving far
        // enough to be worth a packet is still a mob that is now on the ground, and the next
        // move packet is the one that has to say so.
        body.setGrounded(entity.body.conditions.has('on_ground'));

        const at = entity.position;
        const here = body.getPosition();
        const still =
            Math.abs(here.getX() - at.x) < MOVEMENT_EPSILON &&
            Math.abs(here.getY() - at.y) < MOVEMENT_EPSILON &&
            Math.abs(here.getZ() - at.z) < MOVEMENT_EPSILON &&
            body.yaw === entity.body.yaw &&
            body.pitch === entity.body.pitch;
        if (still) return undefined;

        return body.setPosition({
            position: new Vector3(at.x, at.y, at.z),
            yaw: entity.body.yaw,
            headYaw: entity.body.yaw,
            pitch: entity.body.pitch
        });
    }

    private failed(what: string, error: unknown): void {
        this.options.report(`could not ${what} the body of a data-driven entity: ${String(error)}`);
    }
}
