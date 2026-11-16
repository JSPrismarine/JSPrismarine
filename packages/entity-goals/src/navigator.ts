import type { EntityActuator, EntityPosition } from '@jsprismarine/entities';

import type { Path } from './navigation/pathfinder';
import { findPath } from './navigation/pathfinder';
import type { NavigationProfile } from './navigation/profile';
import type { NavigationView } from './navigation/view';
import { blockOf, centerOf, distanceBetween, entityPositionAtNode } from './navigation/view';

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

/** Java's `PathNavigation.MAX_TIME_RECOMPUTE` cadence, in goal ticks. */
const PATH_RECOMPUTE_TICKS = 20;

/** Compares a path request profile, including the values held in its records. */
const sameProfile = (left: NavigationProfile, right: NavigationProfile): boolean => {
    if (
        left.kind !== right.kind ||
        left.height !== right.height ||
        left.width !== right.width ||
        left.stepHeight !== right.stepHeight ||
        left.maxFallDistance !== right.maxFallDistance ||
        left.canPathOverWater !== right.canPathOverWater ||
        left.canPathOverLava !== right.canPathOverLava ||
        left.canPathFromAir !== right.canPathFromAir ||
        left.canFloat !== right.canFloat ||
        left.canSink !== right.canSink ||
        left.canSwim !== right.canSwim ||
        left.canWalk !== right.canWalk ||
        left.canWalkInLava !== right.canWalkInLava ||
        left.canClimbLadders !== right.canClimbLadders ||
        left.canStandOnPowderSnow !== right.canStandOnPowderSnow ||
        left.canFly !== right.canFly ||
        left.canBreach !== right.canBreach ||
        left.canJump !== right.canJump ||
        left.canOpenDoors !== right.canOpenDoors ||
        left.canOpenIronDoors !== right.canOpenIronDoors ||
        left.canPassDoors !== right.canPassDoors ||
        left.canBreakDoors !== right.canBreakDoors ||
        left.avoidWater !== right.avoidWater ||
        left.avoidSun !== right.avoidSun ||
        left.avoidPortals !== right.avoidPortals ||
        left.avoidDamageBlocks !== right.avoidDamageBlocks ||
        left.isAmphibious !== right.isAmphibious ||
        left.blocksToAvoid.length !== right.blocksToAvoid.length ||
        !left.blocksToAvoid.every((block, index) => block === right.blocksToAvoid[index])
    ) {
        return false;
    }

    const leftMalus = left.pathfindingMalus;
    const rightMalus = right.pathfindingMalus;
    if (leftMalus === undefined || rightMalus === undefined) return leftMalus === rightMalus;

    const leftTypes = Object.keys(leftMalus);
    const rightTypes = Object.keys(rightMalus);
    return leftTypes.length === rightTypes.length && leftTypes.every((type) => leftMalus[type] === rightMalus[type]);
};

/** Whether two requests target the same whole-block destination. */
const sameBlock = (left: EntityPosition | undefined, right: EntityPosition): boolean =>
    left !== undefined && left.x === right.x && left.y === right.y && left.z === right.z;

/** What one entity's movement needs from the rest of the package. */
export interface NavigatorContext {
    /** Moves, looks and jumps; undefined when the caller supplied no actuator. */
    readonly actuator: EntityActuator | undefined;
    /** Reads the blocks; undefined when the caller supplied no view. */
    navigation(): NavigationView | undefined;
    /** The rules the path finder follows for this entity. */
    profile(): NavigationProfile;
    /** The home the entity's random movement is held to, or undefined when it has none. */
    homeRestriction?(): HomeRestriction | undefined;
    /**
     * The entity every navigator of one mob shares, so {@link walkedPathOf} finds the path any of
     * them planned last. Each goal plans with a navigator of its own, where Java's mob has one
     * `PathNavigation`.
     */
    readonly owner?: object;
}

/** The path an entity last planned and the node it walks to, keyed by {@link NavigatorContext.owner}. */
const walkedPaths = new WeakMap<object, { readonly nodes: readonly EntityPosition[]; waypoint: number }>();

/**
 * The nodes of the path an entity last planned, whichever goal planned it, from its first through
 * `ahead` past the one the entity walks to: Java's `Path.getNode(0)` up to
 * `getNextNodeIndex() + ahead`, as `DoorInteractGoal` reads the mob's one `PathNavigation`. A goal
 * that stops its walk leaves the path here, as Java's path stays on the navigation while another
 * goal looks at it.
 */
export const walkedPathOf = (owner: object, ahead: number): readonly EntityPosition[] => {
    const walked = walkedPaths.get(owner);
    if (walked === undefined || walked.waypoint >= walked.nodes.length) return [];
    return walked.nodes.slice(0, Math.min(walked.waypoint + ahead, walked.nodes.length));
};

/** A home position and the radius around it, Java's `Mob.getHomePosition` and `getHomeRadius`. */
export interface HomeRestriction {
    readonly center: EntityPosition;
    readonly radius: number;
}

/**
 * Whether a random destination drawn `range` blocks around the entity breaks its home restriction,
 * by Java's `GoalUtils`: the restriction holds only while the entity is within the radius plus the
 * range plus one of its home (`mobRestricted`), and then a destination must lie inside the radius
 * (`Mob.isWithinHome`, block distance squared under the radius squared). An entity further out
 * draws freely, which is how Java lets one that strayed find its way back.
 */
export const breaksHomeRestriction = (
    home: HomeRestriction,
    here: EntityPosition,
    range: number,
    destination: EntityPosition
): boolean => {
    const center = blockOf(home.center);
    if (distanceBetween(centerOf(center), here) >= home.radius + range + 1) return false;
    const block = blockOf(destination);
    const squared = (block.x - center.x) ** 2 + (block.y - center.y) ** 2 + (block.z - center.z) ** 2;
    return squared >= home.radius * home.radius;
};

/** Moves one entity along a path. */
export class Navigator {
    private path: Path | undefined;
    private waypoint = 0;
    private destination: EntityPosition | undefined;
    /** The block the path under way starts from, Java's first path node. */
    private pathStart: EntityPosition | undefined;
    private plannedTarget: EntityPosition | undefined;
    private plannedGoalRadius: number | undefined;
    private plannedProfile: NavigationProfile | undefined;
    private ticksUntilRecompute = 0;
    private pathNeedsRecompute = false;
    private speed = 1;
    private radius = 1;
    private idleTicks = 0;
    private lastDistance = Number.POSITIVE_INFINITY;

    public constructor(private readonly context: NavigatorContext) {}

    /** Whether a walk is under way. */
    public get walking(): boolean {
        return this.destination !== undefined;
    }

    /**
     * The node of the path under way the entity last left and the one it walks to, Java's
     * `Path.getPreviousNode` and `getNextNode`: the path's start before the first node is reached.
     * Undefined while no path is under way.
     */
    public pathStep(): { readonly previous: EntityPosition | undefined; readonly next: EntityPosition } | undefined {
        const path = this.path;
        if (path === undefined || this.destination === undefined) return undefined;
        const next = path.nodes[this.waypoint];
        if (next === undefined) return undefined;
        return { previous: this.waypoint > 0 ? path.nodes[this.waypoint - 1] : this.pathStart, next };
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
        this.idleTicks = 0;
        this.lastDistance = Number.POSITIVE_INFINITY;

        const view = this.context.navigation();
        if (view === undefined) {
            this.path = undefined;
            this.clearPlannedRoute();
            this.waypoint = 0;
            actuator.moveTo(destination, speedMultiplier);
            return true;
        }

        const target = blockOf(destination);
        const goalRadiusBlocks = Math.max(0, Math.floor(goalRadius));
        const profile = this.context.profile();
        if (
            this.path !== undefined &&
            !this.pathNeedsRecompute &&
            this.ticksUntilRecompute > 1 &&
            sameBlock(this.plannedTarget, target) &&
            this.plannedGoalRadius === goalRadiusBlocks &&
            this.plannedProfile !== undefined &&
            sameProfile(this.plannedProfile, profile)
        ) {
            this.ticksUntilRecompute -= 1;
            this.step();
            return true;
        }

        this.waypoint = 0;
        this.pathStart = blockOf(actuator.position());
        this.path = findPath(view, profile, {
            from: actuator.position(),
            to: destination,
            goalRadius: goalRadiusBlocks
        });
        if (this.path === undefined) {
            this.destination = undefined;
            this.clearPlannedRoute();
            return false;
        }

        if (this.context.owner !== undefined)
            walkedPaths.set(this.context.owner, { nodes: this.path.nodes, waypoint: 0 });
        this.plannedTarget = target;
        this.plannedGoalRadius = goalRadiusBlocks;
        this.plannedProfile = profile;
        this.ticksUntilRecompute = PATH_RECOMPUTE_TICKS;
        this.pathNeedsRecompute = false;
        this.step();
        return true;
    }

    /**
     * Changes the speed of the walk under way, as Java's `PathNavigation.setSpeedModifier` does,
     * from the next step on.
     */
    public setSpeed(speedMultiplier: number): void {
        this.speed = speedMultiplier;
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
        if (current === undefined) {
            this.pathNeedsRecompute = true;
            return false;
        }
        if (distanceBetween(here, entityPositionAtNode(current, this.plannedProfile?.width)) <= WAYPOINT_RADIUS) {
            this.waypoint += 1;
            const walked = this.context.owner === undefined ? undefined : walkedPaths.get(this.context.owner);
            if (walked?.nodes === path.nodes) walked.waypoint = this.waypoint;
            if (this.waypoint >= path.nodes.length) {
                this.pathNeedsRecompute = true;
                return false;
            }
        }
        this.step();
        return true;
    }

    /** Abandons the walk. */
    public stop(): void {
        this.path = undefined;
        this.destination = undefined;
        this.waypoint = 0;
        this.clearPlannedRoute();
        this.context.actuator?.stopMoving();
    }

    /** Invalidates the cached request whenever it no longer describes a usable route. */
    private clearPlannedRoute(): void {
        this.plannedTarget = undefined;
        this.plannedGoalRadius = undefined;
        this.plannedProfile = undefined;
        this.ticksUntilRecompute = 0;
        this.pathNeedsRecompute = false;
    }

    /**
     * A reachable position in the box around the entity.
     *
     * With a view it draws candidates and keeps the first the path finder
     * reaches, skipping water destinations when the active navigation says to
     * avoid water; without one it asks the actuator, which is what the
     * reference goals in `@jsprismarine/entities` do. Either way a destination
     * outside the entity's home restriction is refused
     * ({@link breaksHomeRestriction}), as Java's `RandomPos` refuses it.
     *
     * @param random - Draws the candidate offsets, in [0, 1).
     * @param accept - Refuses a candidate before the path finder sees it, such as one that does not
     *   head where the goal steers.
     */
    public randomTarget(
        xzDistance: number,
        yDistance: number,
        random: () => number,
        attempts = 10,
        accept?: (candidate: EntityPosition) => boolean
    ): EntityPosition | undefined {
        const actuator = this.context.actuator;
        if (actuator === undefined) return undefined;

        const home = this.context.homeRestriction?.();
        const position = actuator.position();
        const restricted = (candidate: EntityPosition): boolean =>
            home !== undefined && breaksHomeRestriction(home, position, xzDistance, candidate);

        const view = this.context.navigation();
        if (view === undefined) {
            const candidate = actuator.randomTarget(xzDistance, yDistance);
            return candidate === undefined || restricted(candidate) || accept?.(candidate) === false
                ? undefined
                : candidate;
        }

        const here = blockOf(position);
        const profile = this.context.profile();
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            const candidate = {
                x: here.x + Math.round((random() * 2 - 1) * xzDistance),
                y: here.y + Math.round((random() * 2 - 1) * yDistance),
                z: here.z + Math.round((random() * 2 - 1) * xzDistance)
            };
            if (restricted(candidate)) continue;
            if (accept !== undefined && !accept(candidate)) continue;
            if (profile.avoidWater && view.isWater(candidate)) continue;

            const path = findPath(view, profile, { from: here, to: candidate });
            if (path !== undefined) return centerOf(candidate);
        }
        return undefined;
    }

    /** Points the actuator at the waypoint the entity is walking to now. */
    private step(): void {
        const node = this.path?.nodes[this.waypoint];
        const destination =
            node === undefined ? this.destination : entityPositionAtNode(node, this.plannedProfile?.width);
        if (destination !== undefined) this.context.actuator?.moveTo(destination, this.speed);
    }
}
