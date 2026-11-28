import type { EntityActuator, EntityPosition } from '@jsprismarine/entities';

import type { Path } from './navigation/pathfinder';
import { canOccupy, findPath } from './navigation/pathfinder';
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

/**
 * The width Java's waypoint test assumes for a body whose actuator does not say, a zombie's.
 * {@link waypointReach} turns it into how close counts as standing on a node.
 */
const DEFAULT_BODY_WIDTH = 0.6;

/** The movement speed assumed for a body whose actuator does not say, in blocks per tick. */
const DEFAULT_MOVEMENT_SPEED = 0.25;

/**
 * How many navigation ticks pass between two of Java's stuck checks.
 *
 * @javaSee PathNavigation.doStuckDetection
 */
const STUCK_CHECK_TICKS = 100;

/** How many nodes ahead of the body a path is checked for a block that has since closed it. */
const BLOCKED_LOOKAHEAD = 3;

/**
 * How near a node a body must be on each horizontal axis to have reached it, Java's
 * `PathNavigation.maxDistanceToWaypoint`: half the body's width for one wider than 0.75 blocks,
 * otherwise 0.75 less half its width.
 *
 * @javaSee PathNavigation.followThePath
 */
const waypointReach = (width: number): number => (width > 0.75 ? width / 2 : 0.75 - width / 2);

/**
 * Java's `PathNavigation.MAX_TIME_RECOMPUTE` cadence, in goal ticks.
 *
 * @javaSource PathNavigation.MAX_TIME_RECOMPUTE
 */
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
 *
 * @javaSource Path.getNode
 */
export const walkedPathOf = (owner: object, ahead: number): readonly EntityPosition[] => {
    const walked = walkedPaths.get(owner);
    if (walked === undefined || walked.waypoint >= walked.nodes.length) return [];
    return walked.nodes.slice(0, Math.min(walked.waypoint + ahead, walked.nodes.length));
};

/**
 * A home position and the radius around it, Java's `Mob.getHomePosition` and `getHomeRadius`.
 *
 * @javaSee Mob.getHomePosition
 */
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

/**
 * The navigator every goal and the brain of one entity share, keyed by
 * {@link NavigatorContext.owner}: Java's mob has one `PathNavigation`, so a goal that starts a
 * walk takes over the one the last goal started, and a goal that stops the walk stops it for all.
 */
const sharedNavigators = new WeakMap<object, Navigator>();

/**
 * The owner's navigator, built by `create` the first time the owner asks.
 *
 * @param owner - The entity the navigator moves.
 * @param create - Builds the navigator when the owner has none yet.
 */
export const navigatorOf = (owner: object, create: () => Navigator): Navigator => {
    const known = sharedNavigators.get(owner);
    if (known !== undefined) return known;
    const navigator = create();
    sharedNavigators.set(owner, navigator);
    return navigator;
};

/**
 * Advances the owner's walk by one game tick unless a goal already did this tick, as Java's
 * `Mob.serverAiStep` ticks the mob's `PathNavigation` every tick whatever its goals do. A host
 * calls it once per entity per tick, after the goals and the brain.
 *
 * @param owner - The entity whose navigator to advance.
 */
export const sweepNavigation = (owner: object): void => {
    sharedNavigators.get(owner)?.sweep();
};

/** What a path search toward a position found. */
export type PathPlan = 'complete' | 'partial';

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
    /** Navigation ticks since the last stuck check, Java's `tick - lastStuckCheck`. */
    private ticksSinceStuckCheck = 0;
    /** Where the body stood at the last stuck check, Java's `lastStuckCheckPos`. */
    private lastStuckCheckAt: EntityPosition | undefined;
    /** Navigation ticks since the path ahead was last checked for a block that closed it. */
    private ticksSinceBlockedCheck = 0;
    /** Whether a host sweeps this navigator every game tick ({@link sweepNavigation}). */
    private swept = false;
    /** Whether the walk advanced since the last sweep, so the sweep does not advance it twice. */
    private advancedSinceSweep = false;
    /** What the last advance answered, which a second {@link tick} in one game tick repeats. */
    private lastAdvance = false;
    /**
     * Whether the last walk ended because the body stopped making progress, Java's
     * `PathNavigation.isStuck`. A new walk clears it.
     */
    public stuck = false;
    /**
     * The route {@link canReach} or {@link plan} last found, which the next {@link moveTo} from
     * the same block to the same block takes instead of searching again: Java's
     * `MeleeAttackGoal` hands the path its `canUse` made to `moveTo` in `start`.
     */
    private checked:
        | {
              readonly path: Path;
              readonly from: EntityPosition;
              readonly to: EntityPosition;
              readonly goalRadius: number;
              readonly profile: NavigationProfile;
          }
        | undefined;

    public constructor(private readonly context: NavigatorContext) {}

    /** Whether a walk is under way. */
    public get walking(): boolean {
        return this.destination !== undefined;
    }

    /** Where the walk under way is headed, or undefined while none is. */
    public get target(): EntityPosition | undefined {
        return this.destination;
    }

    /**
     * Whether the path under way ends within the goal radius of its destination, Java's `Path.canReach`.
     *
     * @javaSee Path.canReach
     */
    public get complete(): boolean {
        return this.path === undefined ? this.destination !== undefined : this.path.reachedGoal;
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
     * Starts walking to a position, along the closest route the path finder finds when no route
     * reaches it, as Java's `PathNavigation.moveTo` follows a path that does not reach its target.
     *
     * @javaSee PathNavigation.moveTo(Lnet/minecraft/world/level/pathfinder/Path;D)Z
     * @param goalRadius - How close counts as arriving, in blocks.
     * @returns Whether the entity has a route that takes it any closer; false leaves the entity
     *   standing where it is, which is what a goal reads to refuse to start.
     */
    public moveTo(destination: EntityPosition, speedMultiplier: number, goalRadius = 1): boolean {
        const actuator = this.context.actuator;
        if (actuator === undefined) return false;

        this.destination = destination;
        this.speed = speedMultiplier;
        this.radius = goalRadius;
        this.stuck = false;
        // Java's `moveTo` restarts the stuck check on every call that has a path.
        this.ticksSinceStuckCheck = 0;
        // A copy, since an actuator may hand out a position it later moves in place.
        this.lastStuckCheckAt = { ...actuator.position() };

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
        const checked = this.checked;
        this.checked = undefined;
        this.path =
            checked !== undefined &&
            sameBlock(checked.from, this.pathStart) &&
            sameBlock(checked.to, target) &&
            checked.goalRadius === goalRadiusBlocks &&
            sameProfile(checked.profile, profile)
                ? checked.path
                : findPath(view, profile, {
                      from: actuator.position(),
                      to: destination,
                      goalRadius: goalRadiusBlocks,
                      allowPartial: true
                  });
        if (this.path === undefined) {
            this.destination = undefined;
            this.clearPlannedRoute();
            // The body walked toward the last path's waypoint; with no path it stands, as Java's
            // move control stops once the navigation stops setting a wanted position.
            actuator.stopMoving();
            return false;
        }

        if (this.context.owner !== undefined)
            walkedPaths.set(this.context.owner, { nodes: this.path.nodes, waypoint: 0 });
        this.plannedTarget = target;
        this.plannedGoalRadius = goalRadiusBlocks;
        this.plannedProfile = profile;
        this.ticksUntilRecompute = PATH_RECOMPUTE_TICKS;
        this.ticksSinceBlockedCheck = 0;
        this.pathNeedsRecompute = false;
        this.step();
        return true;
    }

    /**
     * Changes the speed of the walk under way, as Java's `PathNavigation.setSpeedModifier` does,
     * from the next step on.
     *
     * @javaSource PathNavigation.setSpeedModifier
     */
    public setSpeed(speedMultiplier: number): void {
        this.speed = speedMultiplier;
    }

    /** Whether a route that ends within the goal radius of the position exists, without starting to walk it. */
    public canReach(destination: EntityPosition, goalRadius = 1): boolean {
        const actuator = this.context.actuator;
        if (actuator === undefined) return false;
        const view = this.context.navigation();
        if (view === undefined) return true;
        const profile = this.context.profile();
        const goalRadiusBlocks = Math.max(0, Math.floor(goalRadius));
        const path = findPath(view, profile, {
            from: actuator.position(),
            to: destination,
            goalRadius: goalRadiusBlocks
        });
        this.remember(path, actuator.position(), destination, goalRadiusBlocks, profile);
        return path !== undefined;
    }

    /**
     * Whether a route takes the entity any closer to the position, and whether it reaches it,
     * without starting to walk it: Java's `PathNavigation.createPath` returning a path, and that
     * path's `canReach`.
     *
     * @javaSee PathNavigation.createPath(Lnet/minecraft/core/BlockPos;I)Lnet/minecraft/world/level/pathfinder/Path;
     * @returns `complete` for a route that ends within the goal radius, `partial` for one that
     *   only gets closer, or undefined when no step takes the entity closer.
     */
    public plan(destination: EntityPosition, goalRadius = 1): PathPlan | undefined {
        const actuator = this.context.actuator;
        if (actuator === undefined) return undefined;
        const view = this.context.navigation();
        if (view === undefined) return 'complete';
        const profile = this.context.profile();
        const goalRadiusBlocks = Math.max(0, Math.floor(goalRadius));
        const path = findPath(view, profile, {
            from: actuator.position(),
            to: destination,
            goalRadius: goalRadiusBlocks,
            allowPartial: true
        });
        this.remember(path, actuator.position(), destination, goalRadiusBlocks, profile);
        if (path === undefined) return undefined;
        return path.reachedGoal ? 'complete' : 'partial';
    }

    /**
     * Advances the walk by one tick. A host that calls {@link sweepNavigation} every game tick
     * advances it there too, and a game tick advances the walk once whichever comes first.
     *
     * @returns Whether the walk is still running; false means the entity
     *   arrived, ran out of path or stopped making progress.
     */
    public tick(): boolean {
        if (this.swept && this.advancedSinceSweep) return this.lastAdvance;
        this.advancedSinceSweep = true;
        this.lastAdvance = this.advance();
        return this.lastAdvance;
    }

    /** The game tick's advance, for a walk no goal advanced this tick; see {@link sweepNavigation}. */
    public sweep(): void {
        this.swept = true;
        if (!this.advancedSinceSweep && this.destination !== undefined) this.lastAdvance = this.advance();
        this.advancedSinceSweep = false;
    }

    /** Abandons the walk. */
    public stop(): void {
        this.path = undefined;
        this.checked = undefined;
        this.destination = undefined;
        this.waypoint = 0;
        this.clearPlannedRoute();
        this.context.actuator?.stopMoving();
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

    /** Keeps a search's route for the next {@link moveTo} to the same block. */
    private remember(
        path: Path | undefined,
        from: EntityPosition,
        to: EntityPosition,
        goalRadius: number,
        profile: NavigationProfile
    ): void {
        this.checked =
            path === undefined ? undefined : { path, from: blockOf(from), to: blockOf(to), goalRadius, profile };
    }

    /**
     * One tick of the walk: Java's `PathNavigation.tick`, `followThePath` and `doStuckDetection`.
     *
     * @javaSee PathNavigation.tick()V
     */
    private advance(): boolean {
        const actuator = this.context.actuator;
        const destination = this.destination;
        if (actuator === undefined || destination === undefined) return false;

        const here = actuator.position();
        if (distanceBetween(here, destination) <= this.radius) return false;

        if (this.stuckNow(actuator, here)) {
            this.stuck = true;
            this.stop();
            return false;
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
        const node = entityPositionAtNode(current, this.plannedProfile?.width);
        const reach = waypointReach(actuator.width?.() ?? DEFAULT_BODY_WIDTH);
        if (Math.abs(here.x - node.x) < reach && Math.abs(here.z - node.z) < reach && Math.abs(here.y - node.y) < 1) {
            this.waypoint += 1;
            const walked = this.context.owner === undefined ? undefined : walkedPaths.get(this.context.owner);
            if (walked?.nodes === path.nodes) walked.waypoint = this.waypoint;
            if (this.waypoint >= path.nodes.length) {
                this.pathNeedsRecompute = true;
                return false;
            }
        }
        if (this.blockedAhead(path)) return this.replan();
        this.step();
        return true;
    }

    /**
     * Java's `PathNavigation.doStuckDetection`: every 100 ticks, a body that moved less than its
     * speed allows over them, a quarter of a hundred ticks of its speed (squared below one block a
     * tick), is stuck.
     *
     * @javaSee PathNavigation.doStuckDetection
     */
    private stuckNow(actuator: EntityActuator, here: EntityPosition): boolean {
        this.ticksSinceStuckCheck += 1;
        if (this.ticksSinceStuckCheck <= STUCK_CHECK_TICKS) return false;
        const last = this.lastStuckCheckAt;
        this.ticksSinceStuckCheck = 0;
        this.lastStuckCheckAt = { ...here };
        if (last === undefined) return false;
        const speed = (actuator.movementSpeed?.() ?? DEFAULT_MOVEMENT_SPEED) * this.speed;
        const share = speed >= 1 ? speed : speed * speed;
        const least = share * STUCK_CHECK_TICKS * 0.25;
        return distanceBetween(here, last) < least;
    }

    /**
     * Whether a block placed or a door shut since the path was planned closes one of the next
     * nodes, checked once every {@link PATH_RECOMPUTE_TICKS}: Java's level tells each navigation of
     * the block changes along its path, which this asks of the world instead.
     *
     * @javaSee PathNavigation.shouldRecomputePath
     */
    private blockedAhead(path: Path): boolean {
        this.ticksSinceBlockedCheck += 1;
        if (this.ticksSinceBlockedCheck < PATH_RECOMPUTE_TICKS) return false;
        this.ticksSinceBlockedCheck = 0;
        const view = this.context.navigation();
        const profile = this.plannedProfile;
        if (view === undefined || profile === undefined) return false;
        const last = Math.min(path.nodes.length, this.waypoint + BLOCKED_LOOKAHEAD);
        for (let index = this.waypoint; index < last; index += 1) {
            const node = path.nodes[index];
            if (node !== undefined && !canOccupy(view, profile, entityPositionAtNode(node, profile.width))) return true;
        }
        return false;
    }

    /** Plans the walk under way again from where the entity stands, Java's `recomputePath`. */
    private replan(): boolean {
        const destination = this.destination;
        if (destination === undefined) return false;
        this.path = undefined;
        this.clearPlannedRoute();
        // Java's `recomputePath` plans again without restarting the stuck check `moveTo` restarts.
        const { ticksSinceStuckCheck, lastStuckCheckAt } = this;
        const moving = this.moveTo(destination, this.speed, this.radius);
        this.ticksSinceStuckCheck = ticksSinceStuckCheck;
        this.lastStuckCheckAt = lastStuckCheckAt;
        return moving;
    }

    /** Invalidates the cached request whenever it no longer describes a usable route. */
    private clearPlannedRoute(): void {
        this.plannedTarget = undefined;
        this.plannedGoalRadius = undefined;
        this.plannedProfile = undefined;
        this.ticksUntilRecompute = 0;
        this.pathNeedsRecompute = false;
    }

    /** Points the actuator at the waypoint the entity is walking to now. */
    private step(): void {
        const node = this.path?.nodes[this.waypoint];
        const destination =
            node === undefined ? this.destination : entityPositionAtNode(node, this.plannedProfile?.width);
        if (destination !== undefined) this.context.actuator?.moveTo(destination, this.speed);
    }
}
