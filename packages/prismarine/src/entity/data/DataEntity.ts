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
import type { Brain, BrainMobDefinition } from '@jsprismarine/entity-brains';

import { DamageLog } from './damageLog';
import type { EntityFacts } from './facts';
import { blocksPerTick, liveFactsOf } from './facts';

/** How close to its destination an entity has to be to have arrived, in blocks. */
const ARRIVAL_RADIUS = 0.25;

/** How many ticks of no progress make a walk stuck, which is what a brain reads. */
const STUCK_TICKS = 100;

/** Below this many blocks per tick an impulse has spent itself, so the body stops. */
const IMPULSE_FLOOR = 0.003;

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

    /** Who the entity is fighting, by runtime id, or undefined when it is fighting nobody. */
    public target: number | undefined;

    /** The entity's home position, from `minecraft:home` or a `set_home_position` event. */
    public home: EntityPosition | undefined;

    /** What the entity holds in its main hand. */
    public carried: string | undefined;

    /** What the entity carries that is not in its hand, as item identifiers. */
    public readonly inventory: string[] = [];

    /** Who has hurt the entity, with the running total each has dealt. */
    public readonly damage = new DamageLog();

    /** Who last knocked the entity about, which `target_when_pushed` reads. */
    public lastPusher: number | undefined;

    /** Who tamed the entity, by runtime id, or undefined while it is nobody's. */
    public owner: number | undefined;

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
        const dx = position.x - this.position.x;
        const dz = position.z - this.position.z;
        const dy = position.y - this.position.y;
        this.yaw = (Math.atan2(dz, dx) * 180) / Math.PI - 90;
        this.pitch = (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
    }

    /**
     * Advances the walk by one tick.
     *
     * The step is the entity's own `minecraft:movement` scaled by whatever the
     * goal asked for, so a goal's `speed_multiplier` means the same thing here
     * as it does in the behavior pack.
     */
    public step(): void {
        // A leaping entity goes where the leap sends it, which is Java's rule too: the path
        // resumes once the mob is back on the ground.
        if (this.airborne) return;

        const destination = this.destination;
        if (destination === undefined) return;

        const remaining = distance(this.position, destination);
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

        const speed = blocksPerTick(this.facts.movement) * this.speedMultiplier;
        if (speed <= 0) return;

        const scale = Math.min(speed, remaining) / remaining;
        this.position = {
            x: this.position.x + (destination.x - this.position.x) * scale,
            y: this.position.y + (destination.y - this.position.y) * scale,
            z: this.position.z + (destination.z - this.position.z) * scale
        };
        this.lookAt(destination);
    }
}

/** What a caller says about an entity it creates. */
export interface DataEntityOptions {
    readonly body: MobBody;
    readonly instance: EntityInstance;
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

    /** The brain definition, for one of the twenty mobs Bedrock's JSON cannot express. */
    public readonly brainMob: BrainMobDefinition | undefined;

    /** The live brain, or undefined for a goal-only entity. */
    public readonly brain: Brain | undefined;

    /** Why the entity was taken out of the world, or undefined while it is still in it. */
    public removed: string | undefined;

    public constructor(options: DataEntityOptions) {
        this.body = options.body;
        this.instance = options.instance;
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
    public step(): void {
        this.body.step();
    }
}

/** The straight-line distance between two positions. */
export const distance = (from: EntityPosition, to: EntityPosition): number =>
    Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);

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
