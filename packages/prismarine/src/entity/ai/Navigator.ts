import { Vector3 } from '@jsprismarine/math';
import Heap from 'heap';
import type BlockView from './BlockView';

/**
 * Finding a way through the world, and following it smoothly.
 *
 * The two halves are deliberately separate concerns and both matter to how a mob looks. The search
 * produces a route through blocks, which is by nature a staircase of right angles; following it
 * literally is what makes a mob look like it is on rails. So the route is straightened first, and
 * then followed by aiming at a point some distance *along* it rather than at the next corner, which
 * rounds the corners off.
 */

/**
 * The most nodes any one search may expand, and how the budget is arrived at.
 *
 * Scaled to how far the mob is actually going. Nearly all searches are strolls of ten blocks or
 * less, and on open ground one of those expands a handful of nodes - but a *failed* short search,
 * where the destination turns out to be walled off, explores until it runs out of budget. With one
 * flat budget that cost the same as crossing the map, so an animal wandering into a corner cost as
 * much per tick as a mob pursuing a player across a valley.
 *
 * The cost lands on the tick thread, and a tick that runs late is visible as every mob in sight
 * stuttering - so this is a movement-smoothness number as much as a performance one.
 */
const MAX_EXPANSIONS = 900;
const MIN_EXPANSIONS = 64;
const EXPANSIONS_PER_BLOCK = 24;

/** How far a mob will look for a route at all. Beyond this it is not worth the search. */
const MAX_RANGE = 48;

/** The biggest step up a mob will take without jumping being modelled as anything special. */
const STEP_UP = 1;

/** The furthest a mob will drop on purpose. */
const MAX_DROP = 3;

/** Cost multiplier for moving through water, so a mob prefers the bank. */
const LIQUID_COST = 3;

const DIAGONAL_COST = Math.SQRT2;

/**
 * Nudges the search towards the goal when several routes cost exactly the same.
 *
 * On open ground an exact heuristic makes every route between two points cost identically, so A*
 * has no reason to prefer any of them and dutifully explores the whole rectangle in between - tens
 * of times more nodes than the handful the answer needs. Inflating the estimate by a fraction of a
 * percent breaks those ties towards the goal and collapses the search to something close to a
 * straight line.
 *
 * The cost is that a route may come out a shade longer than the true optimum. For deciding where a
 * cow walks that is not a cost at all, and the path is straightened afterwards regardless.
 */
const TIE_BREAKER = 1.004;

/** The eight compass steps, cardinals first so ties break towards straight lines. */
const STEPS: ReadonlyArray<readonly [number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
];

interface Node {
    x: number;
    y: number;
    z: number;
    /** Cost from the start. */
    g: number;
    /** g plus the estimate to the goal. */
    f: number;
    parent: Node | null;
}

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** Octile distance: the exact cost of the cheapest unobstructed eight-way route. */
const heuristic = (x: number, y: number, z: number, toX: number, toY: number, toZ: number): number => {
    const dx = Math.abs(x - toX);
    const dz = Math.abs(z - toZ);
    const straight = Math.max(dx, dz) - Math.min(dx, dz);

    return straight + DIAGONAL_COST * Math.min(dx, dz) + Math.abs(y - toY) * 0.5;
};

/** A route through the world, as the block positions a mob should pass through. */
export type Path = Vector3[];

/**
 * Searches for a walkable route between two blocks.
 *
 * A* over the block grid. Diagonal steps are allowed - a four-way path through open ground is a
 * visible staircase - but only when both blocks beside the corner are clear, so a mob cannot
 * squeeze between the corners of two walls.
 * @returns {Path | null} The route including the goal, or null if there is none within budget.
 */
export const findPath = (
    view: BlockView,
    from: Vector3,
    to: Vector3,
    { height = 2, width = 1, maxRange = MAX_RANGE }: { height?: number; width?: number; maxRange?: number } = {}
): Path | null => {
    const startX = Math.floor(from.getX());
    const startY = Math.floor(from.getY());
    const startZ = Math.floor(from.getZ());
    const goalX = Math.floor(to.getX());
    const goalY = Math.floor(to.getY());
    const goalZ = Math.floor(to.getZ());

    if (Math.abs(goalX - startX) > maxRange || Math.abs(goalZ - startZ) > maxRange) return null;
    if (startX === goalX && startY === goalY && startZ === goalZ) return null;

    const start: Node = {
        x: startX,
        y: startY,
        z: startZ,
        g: 0,
        f: heuristic(startX, startY, startZ, goalX, goalY, goalZ) * TIE_BREAKER,
        parent: null
    };

    // A binary heap, because this is the inner loop of the whole system. Sorting the open set to
    // find the cheapest node costs O(n log n) *per expansion*, and with a few hundred expansions
    // and an open set in the hundreds that is millions of comparisons for one route - milliseconds,
    // on the tick thread, for every mob that wants to go somewhere. Enough of them at once and the
    // tick itself starts running late, which is visible as mobs stuttering however smooth their
    // movement model is.
    const open = new Heap<Node>((a, b) => a.f - b.f);
    open.push(start);

    const bestCost = new Map<string, number>([[key(startX, startY, startZ), 0]]);
    const closed = new Set<string>();

    let closest = start;
    let closestEstimate = start.f;
    let expansions = 0;

    // How far apart the two ends are, which is what the search is allowed to cost.
    const spread = Math.max(Math.abs(goalX - startX), Math.abs(goalZ - startZ));
    const budget = Math.min(MAX_EXPANSIONS, MIN_EXPANSIONS + spread * EXPANSIONS_PER_BLOCK);

    // Nothing worth reaching lies far outside the two ends: a route that wandered that wide would
    // be refused as a detour anyway, and culling it keeps a blocked search from spiralling.
    const searchRadius = spread + 10;

    while (open.size() > 0 && expansions < budget) {
        const current = open.pop()!;

        const currentKey = key(current.x, current.y, current.z);
        if (closed.has(currentKey)) continue;
        closed.add(currentKey);
        expansions++;

        if (current.x === goalX && current.z === goalZ && Math.abs(current.y - goalY) <= 1) {
            return smooth(view, reconstruct(current), height, width);
        }

        const estimate = heuristic(current.x, current.y, current.z, goalX, goalY, goalZ);
        if (estimate < closestEstimate) {
            closestEstimate = estimate;
            closest = current;
        }

        for (const [dx, dz] of STEPS) {
            const nextX = current.x + dx;
            const nextZ = current.z + dz;

            if (Math.abs(nextX - startX) > searchRadius || Math.abs(nextZ - startZ) > searchRadius) continue;

            // A diagonal is only a step if both of the squares it cuts between are open, or a mob
            // slips through the join between two walls.
            if (dx !== 0 && dz !== 0) {
                if (!view.hasRoomAt(current.x + dx, current.y, current.z, height, width)) continue;
                if (!view.hasRoomAt(current.x, current.y, current.z + dz, height, width)) continue;
            }

            const nextY = footingAt(view, nextX, current.y, nextZ, height, width);
            if (nextY === null) continue;

            const neighbourKey = key(nextX, nextY, nextZ);
            if (closed.has(neighbourKey)) continue;

            let cost = dx !== 0 && dz !== 0 ? DIAGONAL_COST : 1;
            if (view.isLiquid(nextX, nextY, nextZ)) cost *= LIQUID_COST;
            // A step up or a drop is slightly dearer, so a flat way round is preferred.
            cost += Math.abs(nextY - current.y) * 0.4;

            const g = current.g + cost;
            const known = bestCost.get(neighbourKey);
            if (known !== undefined && known <= g) continue;

            bestCost.set(neighbourKey, g);
            open.push({
                x: nextX,
                y: nextY,
                z: nextZ,
                g,
                f: g + heuristic(nextX, nextY, nextZ, goalX, goalY, goalZ) * TIE_BREAKER,
                parent: current
            });
        }
    }

    // Nothing reached the goal. Walking towards it is better than standing still, as long as the
    // partial route actually makes progress.
    if (closest !== start && closestEstimate < start.f * 0.9) {
        return smooth(view, reconstruct(closest), height, width);
    }

    return null;
};

/**
 * Where a mob's feet end up stepping into a column, or null if it cannot.
 *
 * One block up is a step; several down is a drop it will take; anything else is a wall or a hole.
 */
const footingAt = (
    view: BlockView,
    x: number,
    fromY: number,
    z: number,
    height: number,
    width: number
): number | null => {
    for (let y = fromY + STEP_UP; y >= fromY - MAX_DROP; y--) {
        if (!view.hasRoomAt(x, y, z, height, width)) continue;

        // Solid ground, water to swim in, or something low enough in this very cell to stand on
        // top of - a slab or a layer of snow holds a mob up as well as the block beneath it does.
        if (view.isSolid(x, y - 1, z) || view.isLiquid(x, y, z) || view.topAt(x, y, z) > 0) return y;
    }

    return null;
};

const reconstruct = (node: Node): Path => {
    const path: Path = [];
    for (let step: Node | null = node; step !== null; step = step.parent) {
        path.push(new Vector3(step.x + 0.5, step.y, step.z + 0.5));
    }

    return path.reverse();
};

/**
 * Straightens a route by skipping any corner it can see past.
 *
 * This is the difference between a mob crossing open ground in a straight line and one climbing an
 * invisible staircase of one-block turns. The search works on a grid and can only produce paths
 * made of grid steps; a diagonal run across open ground therefore comes out as a zig-zag of
 * alternating cardinal and diagonal moves, and following it literally is exactly the jerkiness that
 * makes server-driven mobs look wrong.
 *
 * Each waypoint reaches as far ahead as it can still walk to in a straight line, and everything
 * between is dropped.
 */
const smooth = (view: BlockView, path: Path, height: number, width: number): Path => {
    if (path.length <= 2) return path;

    const straightened: Path = [path[0]!];
    let index = 0;

    while (index < path.length - 1) {
        let furthest = index + 1;

        for (let candidate = path.length - 1; candidate > index + 1; candidate--) {
            if (walkableBetween(view, path[index]!, path[candidate]!, height, width)) {
                furthest = candidate;
                break;
            }
        }

        straightened.push(path[furthest]!);
        index = furthest;
    }

    return straightened;
};

/**
 * Whether a mob could walk straight from one point to another.
 *
 * Sampled along the line, checking at every sample that there is ground under the body and room
 * for the body itself. The second half of that is what stops the straightening from undoing the
 * search's work: the grid route only ever passes through cells the mob fits in, but the shortcut
 * between two of them is a diagonal across cell corners, and a body nearly a block wide clips
 * those corners even where its centre line does not. Testing the centre line alone is what had
 * sheep grinding their shoulders along every doorway they were sent through.
 */
const walkableBetween = (view: BlockView, from: Vector3, to: Vector3, height: number, width: number): boolean => {
    const dx = to.getX() - from.getX();
    const dy = to.getY() - from.getY();
    const dz = to.getZ() - from.getZ();
    const distance = Math.hypot(dx, dz);

    // Fine enough that nothing narrower than the body can be sampled straight past. Half a block
    // was the bound when the body was a point; now it is the body.
    const steps = Math.max(2, Math.ceil(distance / Math.min(0.5, Math.max(0.25, width / 2))));

    let previousY = Math.floor(from.getY());

    for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        const centreX = from.getX() + dx * t;
        const centreZ = from.getZ() + dz * t;
        const x = Math.floor(centreX);
        const z = Math.floor(centreZ);
        const y = Math.round(from.getY() + dy * t);

        // The straight line has to be walkable as a walk, not just as a line: no climbing more than
        // a step at a time and no crossing a gap.
        if (Math.abs(y - previousY) > STEP_UP) return false;

        const footing = footingAt(view, x, previousY, z, height, width);
        if (footing === null || Math.abs(footing - y) > 1) return false;

        if (view.blocksBox(centreX, footing + view.topAt(x, footing, z), centreZ, width, height)) return false;

        previousY = footing;
    }

    return true;
};

/**
 * Follows a path, handing back the point a mob should currently be steering at.
 *
 * The steering target is not the next waypoint but a point a fixed distance ahead along the route,
 * which is what turns a sequence of corners into a curve: the mob starts leaning into a turn before
 * it arrives at it, exactly as it would if it could see where it was going.
 */
export class PathFollower {
    private path: Path = [];
    private index = 0;

    /** How close to a waypoint counts as having reached it. */
    private static readonly REACHED = 0.7;

    /** How far ahead along the route to aim. Larger is smoother and cuts corners more. */
    private static readonly LOOK_AHEAD = 1.6;

    public setPath(path: Path): void {
        this.path = path;
        this.index = 0;
    }

    public clear(): void {
        this.path = [];
        this.index = 0;
    }

    public isDone(): boolean {
        return this.index >= this.path.length;
    }

    public remaining(): number {
        return Math.max(0, this.path.length - this.index);
    }

    /** Where the route ends, for deciding whether it still goes where the mob wants. */
    public destination(): Vector3 | null {
        return this.path.length > 0 ? this.path[this.path.length - 1]! : null;
    }

    /**
     * Advances past any waypoints already reached and returns where to steer.
     * @param {Vector3} position - Where the mob is now.
     * @returns {Vector3 | null} The point to steer at, or null when the route is finished.
     */
    public steerFrom(position: Vector3): Vector3 | null {
        while (this.index < this.path.length) {
            const waypoint = this.path[this.index]!;
            const flat = Math.hypot(waypoint.getX() - position.getX(), waypoint.getZ() - position.getZ());

            // Close enough to count as arrived. The vertical tolerance is generous: a mob mid-fall
            // or mid-step is still on its way.
            if (flat <= PathFollower.REACHED && Math.abs(waypoint.getY() - position.getY()) <= 2) {
                this.index++;
                continue;
            }

            // Already past it. A mob shoved off its route - by another mob, by a block placed under
            // it, or by having been dropped onto the middle of one - would otherwise turn round and
            // walk back to a waypoint it has left behind.
            const next = this.path[this.index + 1];
            if (next && Math.hypot(next.getX() - position.getX(), next.getZ() - position.getZ()) < flat) {
                this.index++;
                continue;
            }

            break;
        }

        if (this.index >= this.path.length) return null;

        return this.lookAheadPoint(position);
    }

    /**
     * A point on the route roughly {@link LOOK_AHEAD} blocks in front of the mob.
     *
     * Walks forward along the remaining segments accumulating length, and interpolates within
     * whichever segment the distance falls in. Past the end of the route it is simply the end, so a
     * mob arriving does not overshoot its destination.
     */
    private lookAheadPoint(position: Vector3): Vector3 {
        let budget = PathFollower.LOOK_AHEAD;
        let from = position;

        for (let step = this.index; step < this.path.length; step++) {
            const to = this.path[step]!;
            const length = Math.hypot(to.getX() - from.getX(), to.getZ() - from.getZ());

            if (length >= budget) {
                const t = length === 0 ? 1 : budget / length;
                return new Vector3(
                    from.getX() + (to.getX() - from.getX()) * t,
                    to.getY(),
                    from.getZ() + (to.getZ() - from.getZ()) * t
                );
            }

            budget -= length;
            from = to;
        }

        return this.path[this.path.length - 1]!;
    }
}
