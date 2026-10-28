import type { EntityActuator, EntityPosition } from '@jsprismarine/entities';

import type { Path } from './navigation/pathfinder';
import { findPath } from './navigation/pathfinder';
import type { NavigationProfile } from './navigation/profile';
import type { NavigationView } from './navigation/view';
import { blockOf, centerOf, distanceBetween } from './navigation/view';

/**
 * One entity's movement, from a goal's point of view.
 *
 * A goal says where it wants to be; the navigator finds the route, feeds the
 * actuator one waypoint at a time and reports when the walk is over. It is the
 * only place in the package that calls the path finder, so the goals never
 * handle a path.
 *
 * With no {@link NavigationView} the navigator hands the destination straight
 * to `EntityActuator.moveTo` and tracks arrival by distance. That is the
 * degraded mode a server gets before it implements the view, and it is why
 * every movement goal still runs without one.
 */

/** How close to a waypoint counts as standing on it, in blocks. */
const WAYPOINT_RADIUS = 0.7;

/** How many ticks a walk may make no progress before the navigator gives up. */
const STUCK_TICKS = 100;

/** What one entity's movement needs from the rest of the package. */
export interface NavigatorContext {
    /** Moves, looks and jumps; undefined when the caller supplied no actuator. */
    readonly actuator: EntityActuator | undefined;
    /** Reads the blocks; undefined when the caller supplied no view. */
    navigation(): NavigationView | undefined;
    /** The rules the path finder follows for this entity. */
    profile(): NavigationProfile;
}

/** Moves one entity along a path. */
export class Navigator {
    private path: Path | undefined;
    private waypoint = 0;
    private destination: EntityPosition | undefined;
    private speed = 1;
    private radius = 1;
    private idleTicks = 0;
    private lastDistance = Number.POSITIVE_INFINITY;

    public constructor(private readonly context: NavigatorContext) {}

    /** Whether a walk is under way. */
    public get walking(): boolean {
        return this.destination !== undefined;
    }

    /** Whether the last walk ended at its destination. */
    public arrived(): boolean {
        const destination = this.destination;
        if (destination === undefined) return false;
        const here = this.context.actuator?.position();
        return here !== undefined && distanceBetween(here, destination) <= this.radius;
    }

    /**
     * Starts walking to a position.
     *
     * @param goalRadius - How close counts as arriving, in blocks.
     * @returns Whether a route exists; false leaves the entity where it is,
     *   which is what a goal reads to refuse to start.
     */
    public moveTo(destination: EntityPosition, speedMultiplier: number, goalRadius = 1): boolean {
        const actuator = this.context.actuator;
        if (actuator === undefined) return false;

        this.destination = destination;
        this.speed = speedMultiplier;
        this.radius = goalRadius;
        this.waypoint = 0;
        this.idleTicks = 0;
        this.lastDistance = Number.POSITIVE_INFINITY;

        const view = this.context.navigation();
        if (view === undefined) {
            this.path = undefined;
            actuator.moveTo(destination, speedMultiplier);
            return true;
        }

        this.path = findPath(view, this.context.profile(), {
            from: actuator.position(),
            to: destination,
            goalRadius: Math.max(0, Math.floor(goalRadius))
        });
        if (this.path === undefined) {
            this.destination = undefined;
            return false;
        }

        this.step();
        return true;
    }

    /** Whether a route to the position exists, without starting to walk it. */
    public canReach(destination: EntityPosition, goalRadius = 1): boolean {
        const actuator = this.context.actuator;
        if (actuator === undefined) return false;
        const view = this.context.navigation();
        if (view === undefined) return true;
        return (
            findPath(view, this.context.profile(), {
                from: actuator.position(),
                to: destination,
                goalRadius: Math.max(0, Math.floor(goalRadius))
            }) !== undefined
        );
    }

    /**
     * Advances the walk by one tick.
     *
     * @returns Whether the walk is still running; false means the entity
     *   arrived, ran out of path or stopped making progress.
     */
    public tick(): boolean {
        const actuator = this.context.actuator;
        const destination = this.destination;
        if (actuator === undefined || destination === undefined) return false;

        const here = actuator.position();
        const remaining = distanceBetween(here, destination);
        if (remaining <= this.radius) return false;

        if (remaining < this.lastDistance - 0.01) {
            this.lastDistance = remaining;
            this.idleTicks = 0;
        } else {
            this.idleTicks += 1;
            if (this.idleTicks >= STUCK_TICKS) {
                this.stop();
                return false;
            }
        }

        const path = this.path;
        if (path === undefined) {
            actuator.moveTo(destination, this.speed);
            return true;
        }

        const current = path.nodes[this.waypoint];
        if (current === undefined) return false;
        if (distanceBetween(here, centerOf(current)) <= WAYPOINT_RADIUS) {
            this.waypoint += 1;
            if (this.waypoint >= path.nodes.length) return false;
        }
        this.step();
        return true;
    }

    /** Abandons the walk. */
    public stop(): void {
        this.path = undefined;
        this.destination = undefined;
        this.waypoint = 0;
        this.context.actuator?.stopMoving();
    }

    /**
     * A reachable position in the box around the entity.
     *
     * With a view it draws candidates and keeps the first the path finder
     * reaches, skipping water destinations when the active navigation says to
     * avoid water; without one it asks the actuator, which is what the
     * reference goals in `@jsprismarine/entities` do.
     *
     * @param random - Draws the candidate offsets, in [0, 1).
     */
    public randomTarget(
        xzDistance: number,
        yDistance: number,
        random: () => number,
        attempts = 10
    ): EntityPosition | undefined {
        const actuator = this.context.actuator;
        if (actuator === undefined) return undefined;

        const view = this.context.navigation();
        if (view === undefined) return actuator.randomTarget(xzDistance, yDistance);

        const here = blockOf(actuator.position());
        const profile = this.context.profile();
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            const candidate = {
                x: here.x + Math.round((random() * 2 - 1) * xzDistance),
                y: here.y + Math.round((random() * 2 - 1) * yDistance),
                z: here.z + Math.round((random() * 2 - 1) * xzDistance)
            };
            if (profile.avoidWater && view.isWater(candidate)) continue;

            const path = findPath(view, profile, { from: here, to: candidate });
            if (path !== undefined) return centerOf(candidate);
        }
        return undefined;
    }

    /** Points the actuator at the waypoint the entity is walking to now. */
    private step(): void {
        const node = this.path?.nodes[this.waypoint];
        const destination = node === undefined ? this.destination : centerOf(node);
        if (destination !== undefined) this.context.actuator?.moveTo(destination, this.speed);
    }
}
