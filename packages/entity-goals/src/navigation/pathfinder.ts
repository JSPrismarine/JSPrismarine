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
 * cells carry a cost penalty rather than being refused outright. A ground
 * navigator's `canFloat` flag lets it use liquid nodes, but does not give it
 * vertical swim moves. The rules themselves come from the Bedrock
 * `minecraft:navigation.*` flags, which is what the entity definitions
 * actually declare.
 *
 * Three media decide which cells a profile may enter, and a cell is enterable
 * when any enabled medium accepts it: ground (the entity stands on something),
 * liquid movement (the profile can swim or float), or flight (the cell is open
 * air). `minecraft:navigation.climb` adds vertical moves through climbable
 * blocks.
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

/**
 * How far from its origin a key may address a cell, in blocks on each axis.
 *
 * A search expands at most its node budget, and one expansion moves one block,
 * so no cell a search touches is further from the start than the budget. The
 * span is four times the default budget, which leaves the packing correct for
 * every request the goals make and room for a caller that raises the budget.
 */
const KEY_SPAN = 2048;

/** The width of one axis of the key space, which is {@link KEY_SPAN} either way. */
const KEY_WIDTH = KEY_SPAN * 2;

/**
 * One cell as a number, relative to the origin the search started from.
 *
 * Three signed offsets packed into one integer, which a `Map` hashes far
 * faster than the `"x,y,z"` string this used to build: a search touches
 * thousands of cells and built one string per touch. The result stays well
 * inside the safe integer range, so it is arithmetic rather than bitwise,
 * which would wrap at 32 bits.
 *
 * @returns The key, or undefined for a cell further than {@link KEY_SPAN}
 *   from the origin, which the caller answers without the memo.
 */
const keyOf = (origin: EntityPosition, x: number, y: number, z: number): number | undefined => {
    const dx = x - origin.x + KEY_SPAN;
    const dy = y - origin.y + KEY_SPAN;
    const dz = z - origin.z + KEY_SPAN;
    if (dx < 0 || dy < 0 || dz < 0 || dx >= KEY_WIDTH || dy >= KEY_WIDTH || dz >= KEY_WIDTH) return undefined;
    return (dx * KEY_WIDTH + dy) * KEY_WIDTH + dz;
};

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

/**
 * The cell rules of one search, with every answer kept.
 *
 * A path search asks the same question about the same cell several times over:
 * a node tests its own cost, each of its eight neighbors tests the two cells a
 * diagonal would cut past, and a cell that several nodes border is tested once
 * per neighbor. Answering each cell once took a node expansion from about
 * ninety block reads to about twenty-five.
 *
 * The reader is built per search, which is also what keeps it correct: a
 * server may change a block between two searches, and nothing here outlives
 * one.
 */
class CellReader {
    /** What each cell costs to enter, with {@link REFUSED} for one the profile will not. */
    private readonly costs = new Map<number, number>();

    /** Whether the profile can hold each cell, by the same key. */
    private readonly holds = new Map<number, boolean>();

    /**
     * One position handed to the view, rewritten per call.
     *
     * A search reads tens of thousands of cells and allocated a position
     * object for each. {@link NavigationView} says what a view may do with
     * one: read it and answer, not keep it.
     */
    private readonly at = { x: 0, y: 0, z: 0 };

    public constructor(
        private readonly view: NavigationView,
        private readonly profile: NavigationProfile,
        /** The cell keys are packed relative to this, which is where the search began. */
        private readonly origin: EntityPosition
    ) {}

    /** What one cell costs to enter, or undefined when the profile refuses it. */
    public cost(x: number, y: number, z: number): number | undefined {
        const key = keyOf(this.origin, x, y, z);
        if (key === undefined) return this.readCost(x, y, z);

        const known = this.costs.get(key);
        if (known !== undefined) return known === REFUSED ? undefined : known;

        const cost = this.readCost(x, y, z);
        this.costs.set(key, cost ?? REFUSED);
        return cost;
    }

    /** Whether the profile can stay in the cell: supported, swimming, flying or climbing. */
    public holdsPosition(x: number, y: number, z: number): boolean {
        const key = keyOf(this.origin, x, y, z);
        if (key === undefined) return this.readHolds(x, y, z);

        const known = this.holds.get(key);
        if (known !== undefined) return known;

        const holds = this.readHolds(x, y, z);
        this.holds.set(key, holds);
        return holds;
    }

    /** Whether the profile can both enter and stay in the cell, with what entering costs. */
    public enterable(x: number, y: number, z: number): number | undefined {
        const cost = this.cost(x, y, z);
        if (cost === undefined) return undefined;
        return this.holdsPosition(x, y, z) ? cost : undefined;
    }

    /** Whether the profile can climb vertically from this block. */
    public canClimb(x: number, y: number, z: number): boolean {
        const { view, profile } = this;
        const at = this.cell(x, y, z);
        return (
            (profile.kind === 'climb' && view.isClimbable?.(at) === true) ||
            (profile.canClimbLadders === true && view.isLadder?.(at) === true)
        );
    }

    /** Whether a move may pass through the cell without stopping in it. */
    public passesThrough(x: number, y: number, z: number): boolean {
        return this.cost(x, y, z) !== undefined;
    }

    /** The view position for one cell, which is the same object every time. */
    private cell(x: number, y: number, z: number): EntityPosition {
        this.at.x = x;
        this.at.y = y;
        this.at.z = z;
        return this.at;
    }

    private readCost(x: number, y: number, z: number): number | undefined {
        const { view, profile } = this;
        const feet = this.cell(x, y, z);

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
            const block = this.cell(x, y + offset, z);
            if (view.isPassable(block)) continue;
            if (offset > 0 && view.doorAt?.(block) !== undefined) continue;
            return undefined;
        }

        let penalty = 0;

        if (view.isLava(this.cell(x, y, z))) {
            const malus = profile.pathfindingMalus?.lava;
            if (malus !== undefined) {
                if (malus < 0) return undefined;
                penalty += malus;
            } else if (!profile.canWalkInLava) return undefined;
        } else if (view.isWater(this.cell(x, y, z))) {
            const malus = profile.pathfindingMalus?.water;
            if (malus !== undefined) {
                if (malus < 0) return undefined;
                penalty += malus;
            } else {
                const swims = profile.canSwim || profile.canFloat || profile.isAmphibious;
                if (profile.avoidWater) {
                    if (!swims) return undefined;
                    penalty += AVOIDED_CELL_COST;
                }
            }
        }

        if (profile.avoidSun && view.isSunlit?.(this.cell(x, y, z)) === true) penalty += AVOIDED_CELL_COST;

        return penalty;
    }

    private readHolds(x: number, y: number, z: number): boolean {
        const { profile } = this;
        if (profile.canFly) return true;
        if (this.inNavigableLiquid(x, y, z)) return true;
        if (this.hasSupport(x, y, z)) return true;
        return this.canClimb(x, y, z);
    }

    /** Whether the ground medium carries an entity standing in the cell. */
    private hasSupport(x: number, y: number, z: number): boolean {
        const { view, profile } = this;
        if (!profile.canWalk) return false;
        // Navigation flags can ask the pathfinder to consider a route across
        // liquid surfaces, but liquids never support an entity's collision
        // box. Swimmers enter the liquid through `inSwimmableLiquid` instead.
        return view.isSolid(this.cell(x, y - 1, z));
    }

    /** Whether a swimmer or a ground navigator that can float can occupy this liquid cell. */
    private inNavigableLiquid(x: number, y: number, z: number): boolean {
        const { view, profile } = this;
        if (!(profile.canSwim || profile.isAmphibious || profile.canFloat)) return false;
        if (view.isWater(this.cell(x, y, z))) return true;
        return view.isLava(this.cell(x, y, z)) && profile.canWalkInLava;
    }
}

/** The cost stored for a cell the profile refuses, which no real cost can be. */
const REFUSED = -1;

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
const neighborsOf = (cells: CellReader, profile: NavigationProfile, node: SearchNode): readonly Step[] => {
    const steps: Step[] = [];
    const stepUp = profile.stepHeight >= 1 || profile.canJump ? 1 : 0;

    for (const [dx, dz] of HORIZONTAL) {
        const x = node.x + dx;
        const z = node.z + dz;
        const diagonal = dx !== 0 && dz !== 0;
        const base = diagonal ? Math.SQRT2 : 1;

        // A diagonal move may not cut a corner, so both sides have to be open.
        if (
            diagonal &&
            !(cells.passesThrough(node.x + dx, node.y, node.z) && cells.passesThrough(node.x, node.y, node.z + dz))
        )
            continue;

        const level = cells.enterable(x, node.y, z);
        if (level !== undefined) {
            steps.push({ x, y: node.y, z, cost: base + level });
            continue;
        }

        if (!diagonal && stepUp > 0) {
            // Stepping up needs the block over the entity's head to be free.
            const headroom = cells.passesThrough(node.x, node.y + stepUp, node.z);
            const up = headroom ? cells.enterable(x, node.y + stepUp, z) : undefined;
            if (up !== undefined) {
                steps.push({ x, y: node.y + stepUp, z, cost: base + up + 0.5 });
                continue;
            }
        }

        if (diagonal) continue;

        for (let drop = 1; drop <= profile.maxFallDistance; drop += 1) {
            const y = node.y - drop;
            if (!cells.passesThrough(x, y + 1, z)) break;
            const down = cells.enterable(x, y, z);
            if (down === undefined) continue;
            steps.push({ x, y, z, cost: base + down + drop * 0.25 });
            break;
        }
    }

    const vertical =
        profile.canFly || profile.canSwim || profile.isAmphibious || cells.canClimb(node.x, node.y, node.z);
    if (vertical) {
        for (const dy of [1, -1]) {
            const y = node.y + dy;
            const cost = cells.enterable(node.x, y, node.z);
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
    const block = blockOf(at);
    return new CellReader(view, profile, block).enterable(block.x, block.y, block.z) !== undefined;
};

/**
 * Whether any cell the search could finish on is one the profile can occupy.
 *
 * The search succeeds only by popping a node within the goal radius, and every
 * node but the root came out of {@link CellReader.enterable}. So when no cell
 * in the goal radius is enterable, the search cannot succeed, and saying so
 * costs a few dozen block reads instead of the whole node budget. That is the
 * difference between a mob that draws ten unreachable candidates costing a few
 * hundred reads and costing half a million, which is where the tick spikes
 * came from.
 *
 * The cells it reads stay in the reader, so a search that does go ahead gets
 * them back for nothing.
 */
const goalIsOccupiable = (cells: CellReader, goal: EntityPosition, goalRadius: number): boolean => {
    const span = Math.floor(goalRadius);
    for (let dx = -span; dx <= span; dx += 1)
        for (let dy = -span; dy <= span; dy += 1)
            for (let dz = -span; dz <= span; dz += 1) {
                if (Math.hypot(dx, dy, dz) > goalRadius) continue;
                if (cells.enterable(goal.x + dx, goal.y + dy, goal.z + dz) !== undefined) return true;
            }
    return false;
};

/** How many cells the goal radius covers, which is what decides whether scanning it pays. */
const goalRegionSize = (goalRadius: number): number => (2 * Math.floor(goalRadius) + 1) ** 3;

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
    const cells = new CellReader(view, profile, start);

    const root: SearchNode = {
        x: start.x,
        y: start.y,
        z: start.z,
        cost: 0,
        estimate: distance(start, goal),
        parent: undefined
    };
    if (root.estimate <= goalRadius) return { nodes: [], reachedGoal: true };

    // A partial request wants the closest node reached whether the goal is occupiable or not,
    // and a radius wide enough to hold more cells than the budget would expand is not worth
    // scanning.
    if (
        request.allowPartial !== true &&
        goalRegionSize(goalRadius) <= budget &&
        !goalIsOccupiable(cells, goal, goalRadius)
    )
        return undefined;

    const queue = new NodeQueue();
    const best = new Map<number, number>();
    queue.push(root);
    const rootKey = keyOf(start, root.x, root.y, root.z);
    if (rootKey !== undefined) best.set(rootKey, 0);

    let closest = root;
    let expanded = 0;

    while (queue.size > 0) {
        const node = queue.pop();
        if (node === undefined) break;
        const nodeKey = keyOf(start, node.x, node.y, node.z);
        if (nodeKey !== undefined && best.get(nodeKey) !== node.cost) continue;

        if (node.estimate <= goalRadius) return { nodes: unwind(node), reachedGoal: true };
        if (node.estimate < closest.estimate) closest = node;

        expanded += 1;
        if (expanded > budget) break;

        for (const step of neighborsOf(cells, profile, node)) {
            const key = keyOf(start, step.x, step.y, step.z);
            const cost = node.cost + step.cost;
            if (key !== undefined) {
                const known = best.get(key);
                if (known !== undefined && known <= cost) continue;
                best.set(key, cost);
            }
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
