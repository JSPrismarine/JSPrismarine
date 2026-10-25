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

import type { EntityFacts } from './facts';
import { blocksPerTick } from './facts';

/** How close to its destination an entity has to be to have arrived, in blocks. */
const ARRIVAL_RADIUS = 0.25;

/** How many ticks of no progress make a walk stuck, which is what a brain reads. */
const STUCK_TICKS = 100;

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
    /** Where the entity is now. */
    public position: EntityPosition;

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

    private destination: EntityPosition | undefined;
    private speedMultiplier = 1;
    /** Ticks since the destination was set without the entity getting any closer. */
    private idleTicks = 0;
    private lastDistance = Number.POSITIVE_INFINITY;

    public constructor(
        /** The runtime id, unique for the length of the session. */
        public readonly id: number,
        position: EntityPosition,
        /** The type's facts, of which `minecraft:movement` is what every goal multiplier scales. */
        public readonly facts: EntityFacts
    ) {
        this.position = position;
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
    }

    /** The runtime id, unique for the length of the session. */
    public get id(): number {
        return this.body.id;
    }

    /** The type's facts: its box, its stats and its families. */
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
