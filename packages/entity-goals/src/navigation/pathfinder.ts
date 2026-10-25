import type { EntityPosition } from '@jsprismarine/entities';

import type { NavigationProfile } from './profile';
import type { NavigationView } from './view';
import { blockOf } from './view';

/**
 * An A* search over whole blocks, run against a {@link NavigationView} and
 * governed by a {@link NavigationProfile}.
 *
 * The model is Java's in shape, because Java's `WalkNodeEvaluator` is the only
 * published implementation of the same idea: a cell is enterable when the
 * entity fits in it and something carries the entity there, and the awkward
 * cells carry a cost penalty rather than being refused outright. The rules
 * themselves come from the Bedrock `minecraft:navigation.*` flags, which is
 * what the entity definitions actually declare.
 *
 * Three media decide which cells a profile may enter, and a cell is enterable
 * when any enabled medium accepts it: ground (the entity stands on something),
 * swim (the cell is a liquid the entity moves through) and fly (the cell is
 * open air). `minecraft:navigation.climb` adds vertical moves through
 * climbable blocks.
 */

/** The extra cost of a cell a profile would rather not enter. */
const AVOIDED_CELL_COST = 8;

/** How many nodes the search expands when the caller names no budget. */
const DEFAULT_MAX_NODES = 512;

/** What to path toward, and how hard to look. */
export interface PathRequest {
    /** Where the entity is now; the search floors it to a block. */
    readonly from: EntityPosition;
    /** Where the entity wants to be. */
    readonly to: EntityPosition;
    /** How close to `to` counts as arriving, in blocks. Defaults to the exact block. */
    readonly goalRadius?: number;
    /** The most nodes to expand before giving up. Defaults to 512. */
    readonly maxNodes?: number;
    /** Whether to return the closest node reached when the goal is out of reach. */
    readonly allowPartial?: boolean;
}

/** A route through the world, as block positions. */
export interface Path {
    /** The blocks to walk, the first step first and the start left out. */
    readonly nodes: readonly EntityPosition[];
    /** Whether the last node is within the request's goal radius. */
    readonly reachedGoal: boolean;
}

interface SearchNode {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly cost: number;
    readonly estimate: number;
    readonly parent: SearchNode | undefined;
}

const keyOf = (x: number, y: number, z: number): string => `${x},${y},${z}`;

const distance = (a: { x: number; y: number; z: number }, b: EntityPosition): number =>
    Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** A binary heap over search nodes, ordered by cost plus estimate. */
class NodeQueue {
    private readonly items: SearchNode[] = [];

    public get size(): number {
        return this.items.length;
    }

    public push(node: SearchNode): void {
        this.items.push(node);
        let index = this.items.length - 1;
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (this.score(parent) <= this.score(index)) break;
            this.swap(parent, index);
            index = parent;
        }
    }

    public pop(): SearchNode | undefined {
        const top = this.items[0];
        const last = this.items.pop();
        if (last !== undefined && this.items.length > 0) {
            this.items[0] = last;
            let index = 0;
            for (;;) {
                const left = index * 2 + 1;
                const right = left + 1;
                let best = index;
                if (left < this.items.length && this.score(left) < this.score(best)) best = left;
                if (right < this.items.length && this.score(right) < this.score(best)) best = right;
                if (best === index) break;
                this.swap(best, index);
                index = best;
            }
        }
        return top;
    }

    private score(index: number): number {
        const node = this.items[index];
        return node === undefined ? Number.POSITIVE_INFINITY : node.cost + node.estimate;
    }

    private swap(a: number, b: number): void {
        const left = this.items[a];
        const right = this.items[b];
        if (left === undefined || right === undefined) return;
        this.items[a] = right;
        this.items[b] = left;
    }
}

/** What one cell costs to enter, or undefined when the profile refuses it. */
const cellCost = (
    view: NavigationView,
    profile: NavigationProfile,
    x: number,
    y: number,
    z: number
): number | undefined => {
    const feet = { x, y, z };

    if (profile.blocksToAvoid.length > 0) {
        const identifier = view.blockAt(feet);
        if (identifier !== undefined && profile.blocksToAvoid.includes(identifier)) return undefined;
    }

    if (profile.avoidDamageBlocks && view.isDamaging?.(feet) === true) return undefined;
    if (profile.avoidPortals && view.isPortal?.(feet) === true) return undefined;

    const door = view.doorAt?.(feet);
    if (door !== undefined) {
        if (door.open) {
            if (!profile.canPassDoors) return undefined;
        } else {
            const opens = door.iron ? profile.canOpenDoors && profile.canOpenIronDoors : profile.canOpenDoors;
            if (!opens && !profile.canBreakDoors) return undefined;
        }
    }

    // Headroom: every block the entity occupies has to be free.
    for (let offset = 0; offset < profile.height; offset += 1) {
        const block = { x, y: y + offset, z };
        if (view.isPassable(block)) continue;
        if (offset > 0 && view.doorAt?.(block) !== undefined) continue;
        return undefined;
    }

    let penalty = 0;

    if (view.isLava(feet)) {
        if (!profile.canWalkInLava) return undefined;
    } else if (view.isWater(feet)) {
        const swims = profile.canSwim || profile.canFloat || profile.isAmphibious;
        if (profile.avoidWater) {
            if (!swims) return undefined;
            penalty += AVOIDED_CELL_COST;
        }
    }

    if (profile.avoidSun && view.isSunlit?.(feet) === true) penalty += AVOIDED_CELL_COST;

    return penalty;
};

/** Whether the ground medium carries an entity standing in the cell. */
const hasSupport = (view: NavigationView, profile: NavigationProfile, x: number, y: number, z: number): boolean => {
    if (!profile.canWalk) return false;
    const below = { x, y: y - 1, z };
    if (view.isSolid(below)) return true;
    if (view.isWater(below)) return profile.canPathOverWater || profile.canFloat || profile.isAmphibious;
    if (view.isLava(below)) return profile.canPathOverLava || profile.canWalkInLava;
    return false;
};

/** Whether the swim medium carries an entity in the cell. */
const inSwimmableLiquid = (
    view: NavigationView,
    profile: NavigationProfile,
    x: number,
    y: number,
    z: number
): boolean => {
    if (!(profile.canSwim || profile.isAmphibious || profile.canFloat)) return false;
    const feet = { x, y, z };
    if (view.isWater(feet)) return true;
    return view.isLava(feet) && profile.canWalkInLava;
};

/** Whether the entity can hold the cell without standing on anything. */
const holdsPosition = (view: NavigationView, profile: NavigationProfile, x: number, y: number, z: number): boolean =>
    profile.canFly || inSwimmableLiquid(view, profile, x, y, z) || hasSupport(view, profile, x, y, z);

/** Whether the profile climbs through the cell, which is what the climb navigation does. */
const climbs = (view: NavigationView, profile: NavigationProfile, x: number, y: number, z: number): boolean =>
    profile.kind === 'climb' && view.isClimbable?.({ x, y, z }) === true;

const HORIZONTAL: readonly (readonly [number, number])[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
];

/** One reachable neighbor of a node, with what the move costs. */
interface Step {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly cost: number;
}

/**
 * The cells reachable from one node in a single move.
 *
 * A ground move keeps the same height, steps up by one when the profile
 * jumps, or falls to the first supported cell within the fall limit. A flying,
 * swimming or climbing move adds the two vertical neighbors.
 */
const neighborsOf = (view: NavigationView, profile: NavigationProfile, node: SearchNode): readonly Step[] => {
    const steps: Step[] = [];
    const stepUp = profile.stepHeight >= 1 || profile.canJump ? 1 : 0;

    const enterable = (x: number, y: number, z: number): number | undefined => {
        const cost = cellCost(view, profile, x, y, z);
        if (cost === undefined) return undefined;
        if (!holdsPosition(view, profile, x, y, z) && !climbs(view, profile, x, y, z)) return undefined;
        return cost;
    };

    const passesThrough = (x: number, y: number, z: number): boolean => cellCost(view, profile, x, y, z) !== undefined;

    for (const [dx, dz] of HORIZONTAL) {
        const x = node.x + dx;
        const z = node.z + dz;
        const diagonal = dx !== 0 && dz !== 0;
        const base = diagonal ? Math.SQRT2 : 1;

        // A diagonal move may not cut a corner, so both sides have to be open.
        if (diagonal && !(passesThrough(node.x + dx, node.y, node.z) && passesThrough(node.x, node.y, node.z + dz)))
            continue;

        const level = enterable(x, node.y, z);
        if (level !== undefined) {
            steps.push({ x, y: node.y, z, cost: base + level });
            continue;
        }

        if (!diagonal && stepUp > 0) {
            // Stepping up needs the block over the entity's head to be free.
            const headroom = passesThrough(node.x, node.y + stepUp, node.z);
            const up = headroom ? enterable(x, node.y + stepUp, z) : undefined;
            if (up !== undefined) {
                steps.push({ x, y: node.y + stepUp, z, cost: base + up + 0.5 });
                continue;
            }
        }

        if (diagonal) continue;

        for (let drop = 1; drop <= profile.maxFallDistance; drop += 1) {
            const y = node.y - drop;
            if (!passesThrough(x, y + 1, z)) break;
            const down = enterable(x, y, z);
            if (down === undefined) continue;
            steps.push({ x, y, z, cost: base + down + drop * 0.25 });
            break;
        }
    }

    const vertical = profile.canFly || profile.canSwim || profile.isAmphibious || profile.kind === 'climb';
    if (vertical) {
        for (const dy of [1, -1]) {
            const y = node.y + dy;
            const cost = enterable(node.x, y, node.z);
            if (cost !== undefined) steps.push({ x: node.x, y, z: node.z, cost: 1 + cost });
        }
    }

    return steps;
};

/** Walks the parent chain back into a list of positions, the start left out. */
const unwind = (node: SearchNode): readonly EntityPosition[] => {
    const nodes: EntityPosition[] = [];
    let current: SearchNode | undefined = node;
    while (current?.parent !== undefined) {
        nodes.push({ x: current.x, y: current.y, z: current.z });
        current = current.parent;
    }
    return nodes.reverse();
};

/**
 * Whether the profile can stand in one cell.
 *
 * The same two tests {@link findPath} applies to every cell it expands, so a
 * caller that draws a candidate destination can reject an impossible one for
 * a handful of block reads instead of a whole search. That matters because a
 * wander draws ten candidates a time and a search that fails expands its
 * whole node budget before it says so. Java's `RandomPos` validates its draw
 * the same way and for the same reason.
 */
export const canOccupy = (view: NavigationView, profile: NavigationProfile, at: EntityPosition): boolean => {
    const { x, y, z } = blockOf(at);
    if (cellCost(view, profile, x, y, z) === undefined) return false;
    return holdsPosition(view, profile, x, y, z) || climbs(view, profile, x, y, z);
};

/**
 * Finds a route from one position to another.
 *
 * @returns The path, or undefined when the goal is out of reach and the
 *   request did not ask for a partial one. A request whose start already
 *   satisfies the goal radius returns an empty path.
 */
export const findPath = (view: NavigationView, profile: NavigationProfile, request: PathRequest): Path | undefined => {
    const start = blockOf(request.from);
    const goal = blockOf(request.to);
    const goalRadius = request.goalRadius ?? 0;
    const budget = request.maxNodes ?? DEFAULT_MAX_NODES;

    const root: SearchNode = {
        x: start.x,
        y: start.y,
        z: start.z,
        cost: 0,
        estimate: distance(start, goal),
        parent: undefined
    };
    if (root.estimate <= goalRadius) return { nodes: [], reachedGoal: true };

    const queue = new NodeQueue();
    const best = new Map<string, number>();
    queue.push(root);
    best.set(keyOf(root.x, root.y, root.z), 0);

    let closest = root;
    let expanded = 0;

    while (queue.size > 0) {
        const node = queue.pop();
        if (node === undefined) break;
        if (best.get(keyOf(node.x, node.y, node.z)) !== node.cost) continue;

        if (node.estimate <= goalRadius) return { nodes: unwind(node), reachedGoal: true };
        if (node.estimate < closest.estimate) closest = node;

        expanded += 1;
        if (expanded > budget) break;

        for (const step of neighborsOf(view, profile, node)) {
            const key = keyOf(step.x, step.y, step.z);
            const cost = node.cost + step.cost;
            const known = best.get(key);
            if (known !== undefined && known <= cost) continue;
            best.set(key, cost);
            queue.push({
                x: step.x,
                y: step.y,
                z: step.z,
                cost,
                estimate: distance(step, goal),
                parent: node
            });
        }
    }

    if (!request.allowPartial || closest === root) return undefined;
    return { nodes: unwind(closest), reachedGoal: false };
};
