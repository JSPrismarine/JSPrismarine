/**
 * One live data-driven entity: a type reference plus component state.
 *
 * What used to be a subclass per species is a reference to a resolved
 * `EntityType` and an `EntityInstance` holding the components that are active
 * now. A zombie differs from a cow in what its definition says, not in what
 * class it is, so this file is the only entity "class" the data-driven path
 * has.
 *
 * The body is split out of the entity because the actuator the goals drive has
 * to exist before the `EntityInstance` does: a goal component builds its
 * `GoalSupport` while the instance is being constructed, and that reads the
 * actuator straight away. So a {@link MobBody} is made first, the actuator
 * wraps it, and the entity is the pair.
 */
import type { EntityInstance, EntityPosition } from '@jsprismarine/entities';
import { isRecord } from '@jsprismarine/entities';
import type { Brain, BrainMobDefinition } from '@jsprismarine/entity-brains';

import { DamageLog } from './damageLog';
import type { MobEquipmentSet } from '../equipment';
import { NO_EQUIPMENT, sameEquipment } from '../equipment';
import type { EntityFacts } from './facts';
import { liveFactsOf } from './facts';
import { moveOnAxis } from './collision';
import { entityEyePosition } from './position';

/** How close to its destination an entity has to be to have arrived, in blocks. */
const ARRIVAL_RADIUS = 0.25;

/** How many ticks of no progress make a walk stuck, which is what a brain reads. */
const STUCK_TICKS = 100;

/** Below this many blocks per tick an impulse has spent itself, so the body stops. */
const IMPULSE_FLOOR = 0.003;

/** The movement rules the world supplies when a body takes its step. */
interface MobBodyStepOptions {
    /** Whether this entity's active navigation may move freely on the vertical axis. */
    readonly allowVertical: boolean;
    /** Whether the active navigation component permits a jump. */
    readonly canJump: boolean;
    /** The height of one step the entity may jump, in blocks. */
    readonly stepHeight: number;
    /** Whether the entity's collision box fits at the proposed position. */
    readonly canOccupy: (position: EntityPosition) => boolean;
}

/** Java's default jump power for an entity without a jump component or attribute. */
const DEFAULT_JUMP_POWER = 0.42;

/** Java's `LivingEntity.jumpInLiquid` upward impulse, in blocks per tick. */
const FLUID_JUMP_IMPULSE = 0.04;

/**
 * Everything about a live entity that exists before its components do.
 *
 * The split is forced rather than chosen: a goal component builds its
 * `GoalSupport` while the `EntityInstance` is being constructed, and that
 * support reads the actuator and the goal world there and then. So everything
 * those two seams touch has to exist first, which is where it is - the
 * position, the walk, the attack target, the home and the carried item.
 *
 * Both AI systems drive this one object: `EntityActuator` for the goals and
 * `BrainNavigation` for the brains. The camel and the happy ghast run both,
 * and they have to agree about where the entity is.
 */
export class MobBody {
    /**
     * Told whenever the entity moves, so an index over positions can keep up.
     *
     * {@link EntityRuntime} sets it to refile the body in its spatial index.
     * An accessor rather than a field because the index is wrong the instant
     * it misses a move, and there are five places that write a position: the
     * walk, the impulse, a knockback, a teleport and being carried.
     */
    public onMove: (() => void) | undefined;

    /** Where the entity faces, in degrees. */
    public yaw = 0;
    public pitch = 0;

    /** The boolean facts a brain reads off the body, such as `on_ground` or `aggressive`. */
    public readonly conditions = new Set<string>();

    /** The entity's dynamic string tags, shared with `/tag` and `has_tag` filters. */
    public readonly tags = new Set<string>();

    /** Who the entity is fighting, by runtime id, or undefined when it is fighting nobody. */
    public target: number | undefined;

    /** Ticks remaining on an active `minecraft:explode` fuse, if this component is lit. */
    public fuseTicks: number | undefined;

    /** The entity's home position, from `minecraft:home` or a `set_home_position` event. */
    public home: EntityPosition | undefined;

    /**
     * What the entity is holding and wearing, rolled from `minecraft:equipment` at spawn.
     *
     * The main hand of this is what {@link MobBody.carried} reads and writes, so the goals'
     * one-identifier view of a held item and the body's full set are the same state rather
     * than two that can disagree. See `entity/equipment.ts`.
     */
    public equipment: MobEquipmentSet = NO_EQUIPMENT;

    /**
     * How many times {@link MobBody.equipment} has been written.
     *
     * Read by `liveBodies`, which mirrors equipment onto the client-visible body: comparing a
     * counter is what keeps a tick that changed nothing from encoding five items per mob just
     * to find that out. Equipment changes a handful of times in a mob's life, so the steady
     * state is this number not moving.
     */
    public equipmentRevision = 0;

    /**
     * What the entity holds in its main hand, as an item identifier.
     *
     * The goals' view of {@link MobBody.equipment}: a villager's trade offer, an enderman's
     * carried block and whatever `pickup_items` picked up are all written through here. An
     * accessor rather than a field so that a goal setting a held item and a spawn roll putting
     * a bow in the same hand are one piece of state, which is what makes the single write
     * funnel possible.
     */
    public get carried(): string | undefined {
        return this.equipment.mainhand?.identifier;
    }

    public set carried(identifier: string | undefined) {
        if (identifier === this.carried) return;

        this.equipment =
            identifier === undefined
                ? { ...this.equipment, mainhand: undefined }
                : { ...this.equipment, mainhand: { identifier, count: 1 } };
        this.equipmentRevision += 1;
    }

    /**
     * Replaces everything the entity is holding and wearing.
     *
     * Drops a write that changes nothing, which is the same guard
     * `blockentity/blockEntityWrite.ts` applies to a block entity and for the same reason: a
     * write nobody could see is a packet nobody needs. A restored entity is the case that hits
     * it, because a save holds what the spawn roll already produced.
     *
     * @param equipment - The new set, replacing the old one whole.
     * @returns Whether anything changed.
     */
    public setEquipment(equipment: MobEquipmentSet): boolean {
        if (sameEquipment(this.equipment, equipment)) return false;

        this.equipment = equipment;
        this.equipmentRevision += 1;

        return true;
    }

    /** What the entity carries that is not in its hand, as item identifiers. */
    public readonly inventory: string[] = [];

    /** Who has hurt the entity, with the running total each has dealt. */
    public readonly damage = new DamageLog();

    /** Who last knocked the entity about, which `target_when_pushed` reads. */
    public lastPusher: number | undefined;

    /** The online owner's runtime id, or undefined while its owner is offline or absent. */
    public owner: number | undefined;

    /** Stable player identity behind {@link MobBody.owner}, retained across server restarts. */
    public ownerIdentity: string | undefined;

    /** The player with the entity's trade screen open, by runtime id. */
    public tradingPlayer: number | undefined;

    /** Whether the entity is sat down, which the sit goals hold while they run. */
    public sitting = false;

    /** Whether the entity is asleep, which the sleep and nap goals hold while they run. */
    public sleeping = false;

    /**
     * How many ticks the entity stays in love, which is what feeding it a
     * breeding item sets and what `minecraft:behavior.breed` spends.
     */
    public loveTicks = 0;

    /** How many ticks before the entity may breed again, from Java's `Animal.ageUp`. */
    public breedCooldown = 0;

    /**
     * The impulse the leap, charge and ram goals add, in blocks per tick.
     *
     * The runtime spends it rather than {@link MobBody.step}, because landing
     * is a question about blocks and the body has no view of them.
     */
    public velocity: EntityPosition = { x: 0, y: 0, z: 0 };

    private at: EntityPosition;
    private instance: EntityInstance | undefined;
    private destination: EntityPosition | undefined;
    private speedMultiplier = 1;
    /** Ticks since the destination was set without the entity getting any closer. */
    private idleTicks = 0;
    private lastDistance = Number.POSITIVE_INFINITY;
    private live: EntityFacts;

    public constructor(
        /** The runtime id, unique for the length of the session. */
        public readonly id: number,
        position: EntityPosition,
        /** What the type's base components declare, which {@link MobBody.facts} falls back to. */
        public readonly typeFacts: EntityFacts
    ) {
        this.at = position;
        this.live = typeFacts;
    }

    /**
     * The entity's facts as its components make them now.
     *
     * Everything that reads a stat off a body reads it here, and `minecraft:movement`
     * is why: fifteen vanilla types, the zombie and the slime among them, declare it
     * only in a component group their spawn event adds, so the type's figure is zero
     * and a body that trusted it never moved a block.
     *
     * The type's own facts until {@link MobBody.watch} runs, because a body exists
     * before the component state does - a goal component reads the actuator while
     * the `EntityInstance` is still being built.
     */
    public get facts(): EntityFacts {
        return this.live;
    }

    /**
     * Points the body's facts at the component state, which is what makes them live.
     *
     * Called by {@link DataEntity}'s constructor, the first moment both halves of an
     * entity exist, so no caller has to remember to.
     */
    public watch(instance: EntityInstance): void {
        this.instance = instance;
        this.live = liveFactsOf(this.typeFacts, instance);
    }

    /** Where the entity is now. */
    public get position(): EntityPosition {
        return this.at;
    }

    public set position(position: EntityPosition) {
        this.at = position;
        this.onMove?.();
    }

    /** The namespaced identifier, such as `minecraft:zombie`. */
    public get identifier(): string {
        return this.facts.identifier;
    }

    /** Whether a walk is under way. */
    public get walking(): boolean {
        return this.destination !== undefined;
    }

    /** Whether the entity has stopped making progress towards its destination. */
    public get stuck(): boolean {
        return this.destination !== undefined && this.idleTicks >= STUCK_TICKS;
    }

    /** Whether an impulse is still carrying the entity, which suspends its walk. */
    public get airborne(): boolean {
        const { x, y, z } = this.velocity;
        return Math.abs(x) > IMPULSE_FLOOR || Math.abs(y) > IMPULSE_FLOOR || Math.abs(z) > IMPULSE_FLOOR;
    }

    /** Adds to the entity's own velocity, which is what a leap or a charge is. */
    public push(velocity: EntityPosition): void {
        this.velocity = {
            x: this.velocity.x + velocity.x,
            y: this.velocity.y + velocity.y,
            z: this.velocity.z + velocity.z
        };
    }

    /** Drops the impulse, which is what landing does. */
    public land(): void {
        this.velocity = { x: 0, y: 0, z: 0 };
        this.conditions.delete('jumping');
        this.conditions.add('on_ground');
    }

    /** Jumps from the ground or applies Java's upward fluid impulse while swimming. */
    public jump(): void {
        const instance = this.instance;
        if (instance === undefined) return;

        if (this.conditions.has('in_water') || this.conditions.has('in_lava')) {
            this.push({ x: 0, y: FLUID_JUMP_IMPULSE, z: 0 });
            return;
        }

        if (!this.conditions.has('on_ground') || this.airborne) return;

        const navigation = instance.activeComponents().find((name) => name.startsWith('minecraft:navigation.'));
        if (navigation !== undefined) {
            const params = instance.componentParams(navigation);
            if (isRecord(params) && params.canJump === false) return;
        }

        const params = instance.componentParams('minecraft:jump.static');
        const jumpPower =
            isRecord(params) && typeof params.jumpPower === 'number' ? params.jumpPower : DEFAULT_JUMP_POWER;
        this.push({ x: 0, y: jumpPower, z: 0 });
        this.conditions.delete('on_ground');
        this.conditions.add('jumping');
    }

    /** Starts walking towards a position at a multiple of the entity's own speed. */
    public moveTo(position: EntityPosition, speedMultiplier: number): void {
        this.destination = position;
        this.speedMultiplier = speedMultiplier;
        this.idleTicks = 0;
        this.lastDistance = Number.POSITIVE_INFINITY;
    }

    /** Abandons the current walk. */
    public stopMoving(): void {
        this.destination = undefined;
    }

    /** Points the entity's head at a position. */
    public lookAt(position: EntityPosition): void {
        const eye = entityEyePosition(this.position, this.facts.box.height);
        const dx = position.x - eye.x;
        const dz = position.z - eye.z;
        const dy = position.y - eye.y;
        this.yaw = (Math.atan2(dz, dx) * 180) / Math.PI - 90;
        this.pitch = (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
    }

    /**
     * Advances the walk by one tick.
     *
     * The step uses the entity's `minecraft:movement` on land and
     * `minecraft:underwater_movement` in water, scaled by whatever the goal
     * asked for, so a goal's `speed_multiplier` means the same thing here as it
     * does in the behavior pack.
     */
    public step(options?: MobBodyStepOptions): void {
        const destination = this.destination;
        if (destination === undefined) return;

        if (
            options !== undefined &&
            !options.allowVertical &&
            options.canJump &&
            destination.y > this.position.y + ARRIVAL_RADIUS &&
            destination.y <= this.position.y + options.stepHeight + ARRIVAL_RADIUS &&
            !this.airborne
        )
            this.jump();

        // Vertical knockback carries a grounded walker until it lands. Horizontal entity
        // pushes and knockback still combine with the navigation input, as they do in Java.
        if (
            Math.abs(this.velocity.y) > IMPULSE_FLOOR &&
            !this.conditions.has('jumping') &&
            options?.allowVertical !== true
        )
            return;

        const target = options?.allowVertical === false ? { ...destination, y: this.position.y } : destination;
        const remaining =
            options?.allowVertical === false
                ? horizontalDistance(this.position, target)
                : distance(this.position, target);
        if (remaining <= ARRIVAL_RADIUS) {
            this.destination = undefined;
            return;
        }

        if (remaining < this.lastDistance - 1e-6) {
            this.lastDistance = remaining;
            this.idleTicks = 0;
        } else {
            this.idleTicks += 1;
        }

        const movement = this.conditions.has('in_water') ? this.facts.underwaterMovement : this.facts.movement;
        const speed = movement * this.speedMultiplier;
        if (speed <= 0) return;

        const scale = Math.min(speed, remaining) / remaining;
        const proposed = {
            x: this.position.x + (destination.x - this.position.x) * scale,
            y: this.position.y + (target.y - this.position.y) * scale,
            z: this.position.z + (destination.z - this.position.z) * scale
        };

        if (options === undefined) {
            this.position = proposed;
        } else {
            let resolved = this.position;
            if (options.allowVertical) {
                resolved = moveOnAxis(resolved, proposed.y, 'y', options.canOccupy);
            }

            resolved = moveOnAxis(resolved, proposed.x, 'x', options.canOccupy);
            resolved = moveOnAxis(resolved, proposed.z, 'z', options.canOccupy);

            this.position = resolved;
        }
        this.lookAt(destination);
    }
}

/** What a caller says about an entity it creates. */
export interface DataEntityOptions {
    readonly body: MobBody;
    readonly instance: EntityInstance;
    /** Entity-specific fields supplied by the source that spawned it. */
    readonly spawnData?: Readonly<Record<string, unknown>>;
    /** The brain definition for one of the twenty Java brain mobs, when the type is one. */
    readonly brainMob?: BrainMobDefinition;
    /** The brain itself, built from {@link DataEntityOptions.brainMob}. */
    readonly brain?: Brain;
}

/** One live entity in the data-driven runtime. */
export class DataEntity {
    /** Where the entity is, where it is going, and what it is after. */
    public readonly body: MobBody;

    /** The component state machine, which owns the events, properties and goals. */
    public readonly instance: EntityInstance;

    /** Entity-specific fields supplied by the source that spawned it. */
    public readonly spawnData: Readonly<Record<string, unknown>> | undefined;

    /** The brain definition, for one of the twenty mobs Bedrock's JSON cannot express. */
    public readonly brainMob: BrainMobDefinition | undefined;

    /** The live brain, or undefined for a goal-only entity. */
    public readonly brain: Brain | undefined;

    /** Why the entity was taken out of the world, or undefined while it is still in it. */
    public removed: string | undefined;

    public constructor(options: DataEntityOptions) {
        this.body = options.body;
        this.instance = options.instance;
        this.spawnData = options.spawnData;
        this.brainMob = options.brainMob;
        this.brain = options.brain;
        this.body.watch(this.instance);
    }

    /** The runtime id, unique for the length of the session. */
    public get id(): number {
        return this.body.id;
    }

    /** The entity's facts as its active components make them now: its box, its stats and its families. */
    public get facts(): EntityFacts {
        return this.body.facts;
    }

    /** The namespaced identifier, such as `minecraft:zombie`. */
    public get identifier(): string {
        return this.body.identifier;
    }

    /** The boolean facts a brain reads off the body, such as `on_ground` or `aggressive`. */
    public get conditions(): Set<string> {
        return this.body.conditions;
    }

    /** Who the entity is fighting, by runtime id, or undefined when it is fighting nobody. */
    public get target(): number | undefined {
        return this.body.target;
    }

    public set target(id: number | undefined) {
        this.body.target = id;
    }

    /** What the entity holds in its main hand. */
    public get carried(): string | undefined {
        return this.body.carried;
    }

    public set carried(identifier: string | undefined) {
        this.body.carried = identifier;
    }

    /** Everything the entity is holding and wearing. */
    public get equipment(): MobEquipmentSet {
        return this.body.equipment;
    }

    /** Where the entity is now. */
    public get position(): EntityPosition {
        return this.body.position;
    }

    public set position(position: EntityPosition) {
        this.body.position = position;
    }

    /**
     * Whether the entity runs the goal scheduler.
     *
     * Every entity that is not a brain mob does, and so do the two that run
     * both systems: `Camel` and `HappyGhast` carry `registerGoals` as well as
     * `brainProvider` in Java, which is what `alsoRunsGoals` records.
     */
    public get runsGoals(): boolean {
        return this.brainMob === undefined || this.brainMob.alsoRunsGoals;
    }

    /** Advances the walk by one tick. */
    public step(options?: MobBodyStepOptions): void {
        this.body.step(options);
    }
}

/** The straight-line distance between two positions. */
export const distance = (from: EntityPosition, to: EntityPosition): number =>
    Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);

/** The horizontal distance between two positions, ignoring height. */
const horizontalDistance = (from: EntityPosition, to: EntityPosition): number =>
    Math.hypot(to.x - from.x, to.z - from.z);

/**
 * The square of the straight-line distance between two positions.
 *
 * Squaring orders positions the same way the distance does and costs three
 * multiplications instead of a `Math.hypot`, so a scan that only compares,
 * either against a radius or against another candidate, uses this. Use
 * {@link distance} wherever the number itself is the answer, because a squared
 * distance is not one.
 */
export const squaredDistance = (from: EntityPosition, to: EntityPosition): number => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    return dx * dx + dy * dy + dz * dz;
};
