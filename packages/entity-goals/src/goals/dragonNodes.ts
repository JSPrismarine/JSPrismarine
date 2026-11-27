/**
 * The ender dragon's path graph, transcribed from Java 26.3's `EnderDragon.findClosestNode` and
 * `EnderDragon.findPath`: 24 nodes in three rings over the island and A* between them.
 *
 * The arithmetic is Java's: the nodes come from Java's table cosine in `float`, and the search
 * keeps `float` costs on a copy of Java's `BinaryHeap`, whose order among equal costs decides
 * which of two equally short paths the dragon flies. `dragonPhases.vectors.test.ts` checks every
 * path between every pair of nodes against the ones Java found.
 */
import type { EntityPosition } from '@jsprismarine/entities';

import { javaCos, javaSin } from '../javaMth';

const f = Math.fround;

/** One of Java's dragon path nodes, or the block a path ends at past them. */
export interface PathNode {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** A route through the nodes, Java's `Path` over them: the nodes in order and the next one to fly to. */
export interface NodePath {
    readonly nodes: readonly PathNode[];
    next: number;
}

/** Whether a path has no node left to fly to. */
export const isDone = (path: NodePath): boolean => path.next >= path.nodes.length;

/**
 * Java's `EnderDragon.nodeAdjacency`: which of the 24 path nodes each node connects to, as bits.
 *
 * @javaSource EnderDragon.findClosestNode()I
 */
const NODE_ADJACENCY = [
    6146, 8197, 8202, 16404, 32808, 32848, 65696, 131392, 131712, 263424, 526848, 525313, 1581057, 3166214, 2138120,
    6373424, 4358208, 12910976, 9044480, 9706496, 15216640, 13688832, 11763712, 8257536
] as const;

/** How many path nodes ring the fountain: 12 out at 60, 8 at 40 and 4 at 20. */
const NODE_COUNT = 24;
/** The first inner node; a fight with no crystals left keeps to the inner two rings. */
const INNER_NODES = 12;
/** The lowest a node may sit, Java's literal 73 in `findClosestNode`. */
const LOWEST_NODE = 73;
/** How far `findClosestNode` looks: a node further than this, squared, is never the closest. */
const CLOSEST_NODE_REACH = 10000;

/**
 * Java's 24 path nodes in Java's `float` arithmetic and table cosine: 12 on a ring of 60 around
 * the world's origin, 8 on a ring of 40 ten blocks higher and 4 on a ring of 20, each 5 blocks
 * over the ground and never below 73. Java centers them on the world's origin whatever the
 * fight's origin is.
 *
 * @param surfaceY - The first y above the ground of a column, Java's `MOTION_BLOCKING_NO_LEAVES`
 *   heightmap, or undefined when the world cannot say, which puts the node at 73.
 * @javaSource EnderDragon.findClosestNode()I
 */
export const dragonPathNodes = (surfaceY: (x: number, z: number) => number | undefined): PathNode[] => {
    const nodes: PathNode[] = [];
    for (let index = 0; index < NODE_COUNT; index += 1) {
        const [radius, step, around, lift] =
            index < 12
                ? [60, f(Math.PI / 12), index, 5]
                : index < 20
                  ? [40, f(Math.PI / 8), index - 12, 15]
                  : [20, f(Math.PI / 4), index - 20, 5];
        const angle = f(2 * f(f(-Math.PI) + f(step * around)));
        const x = Math.floor(f(radius * javaCos(angle)));
        const z = Math.floor(f(radius * javaSin(angle)));
        nodes.push({ x, y: Math.max(LOWEST_NODE, (surfaceY(x, z) ?? LOWEST_NODE) + lift), z });
    }
    return nodes;
};

/**
 * The first node a search may use: the inner rings only, once no crystal is left or outside a fight.
 *
 * @param crystals - How many end crystals stand, or undefined for a dragon outside a fight.
 */
export const firstDragonNode = (crystals: number | undefined): number =>
    crystals === undefined || crystals === 0 ? INNER_NODES : 0;

/**
 * Java's `EnderDragon.findClosestNode(x, y, z)`: the node nearest the block a point is in, from
 * `first` on. A point further than 100 blocks from every node gets node 0.
 *
 * @javaSource EnderDragon.findClosestNode(DDD)I
 */
export const closestDragonNode = (nodes: readonly PathNode[], at: EntityPosition, first: number): number => {
    const from = { x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z) };
    let best = CLOSEST_NODE_REACH;
    let closest = 0;
    for (let index = first; index < NODE_COUNT; index += 1) {
        const node = nodes[index];
        if (node === undefined) continue;
        const away = f((node.x - from.x) ** 2 + (node.y - from.y) ** 2 + (node.z - from.z) ** 2);
        if (away < best) {
            best = away;
            closest = index;
        }
    }
    return closest;
};

/** How far apart two nodes are, in the `float` a path node measures with. */
const nodeDistance = (a: PathNode, b: PathNode): number =>
    f(Math.sqrt(f((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2)));

/**
 * Java's `BinaryHeap` over node indices, ordered by each node's cost. The order it pops nodes of
 * equal cost in is part of which path `findPath` returns.
 */
class NodeHeap {
    private readonly heap: number[] = [];

    public constructor(
        private readonly cost: Float32Array,
        private readonly heapIndex: Int32Array
    ) {}

    public get size(): number {
        return this.heap.length;
    }

    /**
     * Java's `BinaryHeap.insert`.
     *
     * @javaSource BinaryHeap.insert
     */
    public insert(node: number): void {
        this.heap.push(node);
        this.upHeap(this.heap.length - 1);
    }

    /**
     * Java's `BinaryHeap.pop`.
     *
     * @javaSource BinaryHeap.pop
     */
    public pop(): number {
        const popped = this.heap[0] ?? -1;
        const last = this.heap.pop();
        if (this.heap.length > 0 && last !== undefined) {
            this.heap[0] = last;
            this.downHeap(0);
        }
        this.heapIndex[popped] = -1;
        return popped;
    }

    /**
     * Java's `BinaryHeap.changeCost`.
     *
     * @javaSource BinaryHeap.changeCost
     */
    public changeCost(node: number, cost: number): void {
        const old = this.cost[node] ?? 0;
        this.cost[node] = cost;
        const at = this.heapIndex[node] ?? 0;
        if (f(cost) < old) this.upHeap(at);
        else this.downHeap(at);
    }

    private costAt(index: number): number {
        return this.cost[this.heap[index] ?? 0] ?? 0;
    }

    private place(index: number, node: number): void {
        this.heap[index] = node;
        this.heapIndex[node] = index;
    }

    /**
     * Java's `BinaryHeap.upHeap`.
     *
     * @javaSource BinaryHeap.upHeap
     */
    private upHeap(start: number): void {
        let index = start;
        const node = this.heap[index] ?? 0;
        const cost = this.cost[node] ?? 0;
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (!(cost < this.costAt(parent))) break;
            this.place(index, this.heap[parent] ?? 0);
            index = parent;
        }
        this.place(index, node);
    }

    /**
     * Java's `BinaryHeap.downHeap`.
     *
     * @javaSource BinaryHeap.downHeap
     */
    private downHeap(start: number): void {
        let index = start;
        const node = this.heap[index] ?? 0;
        const cost = this.cost[node] ?? 0;
        for (;;) {
            const left = 1 + (index << 1);
            const right = left + 1;
            if (left >= this.heap.length) break;
            const leftCost = this.costAt(left);
            const rightCost = right >= this.heap.length ? Number.POSITIVE_INFINITY : this.costAt(right);
            const [child, childCost] = leftCost < rightCost ? [left, leftCost] : [right, rightCost];
            if (!(childCost < cost)) break;
            this.place(index, this.heap[child] ?? 0);
            index = child;
        }
        this.place(index, node);
    }
}

/**
 * Java's `EnderDragon.findPath`: A* over the node graph from one node to another, in `float`
 * costs on Java's binary heap, ending at `last` when one is given. A search that cannot reach its
 * end goes as near as it can, and one that gets no nearer than it started finds nothing.
 *
 * @param first - The first node the search may pass through, {@link firstDragonNode}.
 * @javaSource EnderDragon.findPath
 */
export const findDragonPath = (
    nodes: readonly PathNode[],
    from: number,
    to: number,
    last: PathNode | undefined,
    first: number
): NodePath | undefined => {
    const start = nodes[from];
    const end = nodes[to];
    if (start === undefined || end === undefined) return undefined;
    const cameFrom = new Int32Array(NODE_COUNT).fill(-1);
    const g = new Float32Array(NODE_COUNT);
    const cost = new Float32Array(NODE_COUNT);
    const heapIndex = new Int32Array(NODE_COUNT).fill(-1);
    const closed = new Uint8Array(NODE_COUNT);
    const open = new NodeHeap(cost, heapIndex);
    cost[from] = nodeDistance(start, end);
    open.insert(from);
    let closest = from;

    const route = (tail: number): NodePath => {
        const indices = [tail];
        for (let at = cameFrom[tail] ?? -1; at >= 0; at = cameFrom[at] ?? -1) indices.unshift(at);
        const route = indices.flatMap((index) => nodes[index] ?? []);
        return { nodes: last === undefined ? route : [...route, last], next: 0 };
    };

    while (open.size > 0) {
        const current = open.pop();
        const node = nodes[current];
        if (node === undefined) break;
        if (current === to) return route(current);
        const nearest = nodes[closest];
        if (nearest !== undefined && nodeDistance(node, end) < nodeDistance(nearest, end)) closest = current;
        closed[current] = 1;

        for (let next = first; next < NODE_COUNT; next += 1) {
            if (((NODE_ADJACENCY[current] ?? 0) & (1 << next)) === 0 || closed[next] === 1) continue;
            const neighbor = nodes[next];
            if (neighbor === undefined) continue;
            const reached = f((g[current] ?? 0) + nodeDistance(node, neighbor));
            const inOpen = (heapIndex[next] ?? -1) >= 0;
            if (inOpen && !(reached < (g[next] ?? 0))) continue;
            cameFrom[next] = current;
            g[next] = reached;
            const estimate = f(reached + nodeDistance(neighbor, end));
            if (inOpen) open.changeCost(next, estimate);
            else {
                cost[next] = estimate;
                open.insert(next);
            }
        }
    }
    return closest === from ? undefined : route(closest);
};
