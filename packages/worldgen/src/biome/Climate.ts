import { f32 } from '../math';
import { asObject, number } from '../json';

/**
 * The factor Java multiplies a climate coordinate by before truncating it to an integer.
 *
 * Every comparison in this file runs on the quantized form, so a biome's parameter ranges and
 * a sampled position meet on the same grid.
 */
export const CLIMATE_QUANTIZATION_FACTOR = 10000;

/** How many axes a parameter point spans: the six climate values plus the offset. */
export const CLIMATE_PARAMETER_COUNT = 7;

/** How many children Java gives a search tree node before it splits again. */
export const CLIMATE_CHILDREN_PER_NODE = 19;

/**
 * Quantizes a climate coordinate the way `Climate.quantizeCoord` does.
 *
 * The multiplication is single precision in Java and the cast truncates toward zero, so both
 * steps are reproduced here. Quantized values never leave `[-20000, 20000]`, and a squared
 * distance over seven axes stays under 2^53, which is why this package keeps them as numbers
 * rather than as the `long` Java uses.
 */
export const quantizeClimateCoord = (coord: number): number =>
    Math.trunc(f32(f32(coord) * CLIMATE_QUANTIZATION_FACTOR));

/** The inverse of {@link quantizeClimateCoord}, used when reporting a sampled value. */
export const unquantizeClimateCoord = (coord: number): number => f32(coord / CLIMATE_QUANTIZATION_FACTOR);

/** One axis of a biome's climate box, in quantized units. */
export interface ClimateParameter {
    /** The inclusive lower bound. */
    readonly min: number;
    /** The inclusive upper bound. */
    readonly max: number;
}

/** A climate box: one range per axis plus the tie-breaking offset. */
export interface ClimateParameterPoint {
    /** How warm the biome is. */
    readonly temperature: ClimateParameter;
    /** How wet the biome is, which Java's noise router still calls vegetation. */
    readonly humidity: ClimateParameter;
    /** The land-versus-ocean axis. */
    readonly continentalness: ClimateParameter;
    /** The flatness axis. */
    readonly erosion: ClimateParameter;
    /** How far below the surface the cell is. */
    readonly depth: ClimateParameter;
    /** The peaks-and-valleys axis. */
    readonly weirdness: ClimateParameter;
    /** A constant penalty that breaks ties between overlapping boxes. */
    readonly offset: number;
}

/** One sampled position in climate space, in quantized units. */
export interface ClimateTargetPoint {
    /** The sampled temperature. */
    readonly temperature: number;
    /** The sampled humidity. */
    readonly humidity: number;
    /** The sampled continentalness. */
    readonly continentalness: number;
    /** The sampled erosion. */
    readonly erosion: number;
    /** The sampled depth. */
    readonly depth: number;
    /** The sampled weirdness. */
    readonly weirdness: number;
}

/** Builds a quantized range from two unquantized floats. */
export const climateSpan = (min: number, max: number): ClimateParameter => {
    if (min > max) throw new RangeError(`min > max: ${min} ${max}`);
    return { min: quantizeClimateCoord(min), max: quantizeClimateCoord(max) };
};

/** Builds a quantized range that covers one point. */
export const climatePoint = (value: number): ClimateParameter => climateSpan(value, value);

/** Builds a target point from six unquantized floats, as `Climate.target` does. */
export const climateTarget = (
    temperature: number,
    humidity: number,
    continentalness: number,
    erosion: number,
    depth: number,
    weirdness: number
): ClimateTargetPoint => ({
    temperature: quantizeClimateCoord(temperature),
    humidity: quantizeClimateCoord(humidity),
    continentalness: quantizeClimateCoord(continentalness),
    erosion: quantizeClimateCoord(erosion),
    depth: quantizeClimateCoord(depth),
    weirdness: quantizeClimateCoord(weirdness)
});

/** How far a target value lies outside a range, or zero when it lies inside. */
const parameterDistance = (min: number, max: number, target: number): number => {
    const above = target - max;
    const below = min - target;
    return above > 0 ? above : Math.max(below, 0);
};

const spanOf = (a: ClimateParameter, b: ClimateParameter | undefined): ClimateParameter =>
    b === undefined ? a : { min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) };

/** The seven axes of a parameter point, in the order the search tree indexes them. */
const parameterSpaceOf = (point: ClimateParameterPoint): ClimateParameter[] => [
    point.temperature,
    point.humidity,
    point.continentalness,
    point.erosion,
    point.depth,
    point.weirdness,
    { min: point.offset, max: point.offset }
];

/**
 * The squared distance from a target to a parameter point, which is what "nearest biome"
 * means.
 */
export const climateFitness = (point: ClimateParameterPoint, target: ClimateTargetPoint): number => {
    let distance = parameterDistance(point.temperature.min, point.temperature.max, target.temperature);
    let total = distance * distance;
    distance = parameterDistance(point.humidity.min, point.humidity.max, target.humidity);
    total += distance * distance;
    distance = parameterDistance(point.continentalness.min, point.continentalness.max, target.continentalness);
    total += distance * distance;
    distance = parameterDistance(point.erosion.min, point.erosion.max, target.erosion);
    total += distance * distance;
    distance = parameterDistance(point.depth.min, point.depth.max, target.depth);
    total += distance * distance;
    distance = parameterDistance(point.weirdness.min, point.weirdness.max, target.weirdness);
    total += distance * distance;
    distance = parameterDistance(point.offset, point.offset, 0);
    total += distance * distance;
    return total;
};

abstract class TreeNode<T> {
    public readonly value?: T;
    /** Centers are reused by every sort in this build; querying them in comparators repeats work. */
    public readonly axisCenters: Float64Array;

    public constructor(public readonly parameterSpace: readonly ClimateParameter[]) {
        this.axisCenters = new Float64Array(CLIMATE_PARAMETER_COUNT);
        for (let axis = 0; axis < CLIMATE_PARAMETER_COUNT; axis++) {
            const parameter = parameterSpace[axis];
            if (parameter === undefined) throw new Error(`Climate tree node is missing axis ${axis}`);
            this.axisCenters[axis] = Math.trunc((parameter.min + parameter.max) / 2);
        }
    }
}

class TreeLeaf<T> extends TreeNode<T> {
    public constructor(
        point: ClimateParameterPoint,
        public readonly value: T
    ) {
        super(parameterSpaceOf(point));
    }
}

class TreeSubtree<T> extends TreeNode<T> {
    public constructor(
        public readonly children: readonly TreeNode<T>[],
        parameterSpace?: readonly ClimateParameter[]
    ) {
        super(parameterSpace ?? buildParameterSpace(children));
    }
}

/** The compact search data flattened from the construction tree. */
interface FlatClimateTree<T> {
    /** Min/max pairs for all seven axes, in node order. */
    readonly bounds: Float64Array;
    /** Start and count of each node's child range in `children`. */
    readonly childStarts: Uint32Array;
    readonly childCounts: Uint32Array;
    /** Child node indices in their original construction order. */
    readonly children: Uint32Array;
    /** The leaf value index for each node, or -1 for a subtree. */
    readonly valueIndices: Int32Array;
    /** The first depth-first leaf rank below each node. */
    readonly firstLeafRanks: Uint32Array;
    /** One value per leaf, in flattened traversal order. */
    readonly values: T[];
    /** Maximum number of nodes from the root through one leaf. */
    readonly maxDepth: number;
}

/** The flattened arrays and per-query scratch state used by either climate table storage. */
interface ClimateSearchArrays {
    readonly bounds: Float64Array;
    readonly childStarts: Uint32Array;
    readonly childCounts: Uint32Array;
    readonly children: Uint32Array;
    readonly valueIndices: Int32Array;
    readonly firstLeafRanks: Uint32Array;
}

/** A reusable stack for one climate lookup instance. */
interface ClimateSearchStack {
    readonly nodes: Uint32Array;
    readonly nextChildren: Uint32Array;
    readonly minimumDistances: Float64Array;
    readonly closestLeaves: Int32Array;
    readonly pendingChildren: Uint32Array;
    readonly pendingDistances: Float64Array;
}

/** The seven-dimensional climate entries and exact nearest-box lookup they index. */
export interface ClimateParameterIndex<T> {
    /** The boxes in the order the source data lists them. */
    readonly entries: readonly ClimateEntry<T>[];
    /** Returns the value of the nearest box, breaking exact ties by first tree order. */
    find(target: ClimateTargetPoint): T;
    /** Returns the value of the nearest box by scanning each source entry in order. */
    findBruteForce(target: ClimateTargetPoint): T;
    /** Returns unique entry values in first-occurrence order. */
    distinctValues(): readonly T[];
}

/** Header markers for the read-only climate table packed into shared memory. */
const SHARED_CLIMATE_MAGIC = 0x4a50_4354;
const SHARED_CLIMATE_VERSION = 1;
const SHARED_CLIMATE_HEADER_BYTES = 64;

interface SharedClimateOffsets {
    readonly bounds: number;
    readonly childStarts: number;
    readonly childCounts: number;
    readonly children: number;
    readonly valueIndices: number;
    readonly firstLeafRanks: number;
    readonly treeValueIndices: number;
    readonly entryBounds: number;
    readonly entryValueIndices: number;
    readonly values: number;
    readonly byteLength: number;
}

const align = (offset: number, byteAlignment: number): number => Math.ceil(offset / byteAlignment) * byteAlignment;

const sharedClimateOffsets = (nodeCount: number, entryCount: number): SharedClimateOffsets => {
    const bounds = SHARED_CLIMATE_HEADER_BYTES;
    const childStarts = bounds + nodeCount * CLIMATE_PARAMETER_COUNT * 2 * Float64Array.BYTES_PER_ELEMENT;
    const childCounts = childStarts + nodeCount * Uint32Array.BYTES_PER_ELEMENT;
    const children = childCounts + nodeCount * Uint32Array.BYTES_PER_ELEMENT;
    const valueIndices = children + (nodeCount - 1) * Uint32Array.BYTES_PER_ELEMENT;
    const firstLeafRanks = valueIndices + nodeCount * Int32Array.BYTES_PER_ELEMENT;
    const treeValueIndices = firstLeafRanks + nodeCount * Uint32Array.BYTES_PER_ELEMENT;
    const entryBounds = align(
        treeValueIndices + entryCount * Uint32Array.BYTES_PER_ELEMENT,
        Float64Array.BYTES_PER_ELEMENT
    );
    const entryValueIndices = entryBounds + entryCount * CLIMATE_PARAMETER_COUNT * 2 * Float64Array.BYTES_PER_ELEMENT;
    const values = entryValueIndices + entryCount * Uint32Array.BYTES_PER_ELEMENT;

    return {
        bounds,
        childStarts,
        childCounts,
        children,
        valueIndices,
        firstLeafRanks,
        treeValueIndices,
        entryBounds,
        entryValueIndices,
        values,
        byteLength: values
    };
};

const createClimateSearchStack = (maxDepth: number): ClimateSearchStack => ({
    nodes: new Uint32Array(maxDepth),
    nextChildren: new Uint32Array(maxDepth),
    minimumDistances: new Float64Array(maxDepth),
    closestLeaves: new Int32Array(maxDepth),
    pendingChildren: new Uint32Array(maxDepth),
    pendingDistances: new Float64Array(maxDepth)
});

/** Returns the winning leaf while keeping Java's prior-result pruning and deterministic ties. */
const closestLeaf = (
    tree: ClimateSearchArrays,
    stack: ClimateSearchStack,
    candidate: number,
    target: ClimateTargetPoint
): number => {
    let depth = 0;
    let returnedLeaf = -1;
    stack.nodes[0] = 0;
    stack.nextChildren[0] = tree.childStarts[0] ?? 0;
    stack.minimumDistances[0] = candidate < 0 ? Number.POSITIVE_INFINITY : climateNodeDistance(tree, candidate, target);
    stack.closestLeaves[0] = candidate;

    for (;;) {
        if (returnedLeaf >= 0) {
            if (depth === 0) return returnedLeaf;

            depth--;
            const child = stack.pendingChildren[depth + 1] ?? 0;
            const childDistance = stack.pendingDistances[depth + 1] ?? Number.POSITIVE_INFINITY;
            const leafDistance =
                child === returnedLeaf ? childDistance : climateNodeDistance(tree, returnedLeaf, target);
            const parentMinimum = stack.minimumDistances[depth] ?? Number.POSITIVE_INFINITY;
            const parentClosest = stack.closestLeaves[depth] ?? -1;
            const parentRank = parentClosest < 0 ? Number.POSITIVE_INFINITY : (tree.valueIndices[parentClosest] ?? -1);
            const leafRank = tree.valueIndices[returnedLeaf] ?? -1;
            if (parentMinimum > leafDistance || (parentMinimum === leafDistance && parentRank > leafRank)) {
                stack.minimumDistances[depth] = leafDistance;
                stack.closestLeaves[depth] = returnedLeaf;
            }
            returnedLeaf = -1;
            continue;
        }

        const node = stack.nodes[depth] ?? 0;
        const childCount = tree.childCounts[node] ?? 0;
        if (childCount === 0) {
            returnedLeaf = node;
            continue;
        }

        const nextChild = stack.nextChildren[depth] ?? 0;
        const childEnd = (tree.childStarts[node] ?? 0) + childCount;
        if (nextChild >= childEnd) {
            returnedLeaf = stack.closestLeaves[depth] ?? -1;
            if (returnedLeaf < 0) throw new Error('A climate search subtree produced no leaf');
            continue;
        }

        const child = tree.children[nextChild] ?? 0;
        stack.nextChildren[depth] = nextChild + 1;
        const childDistance = climateNodeDistance(tree, child, target);
        const minimumDistance = stack.minimumDistances[depth] ?? Number.POSITIVE_INFINITY;
        const closest = stack.closestLeaves[depth] ?? -1;
        const closestRank = closest < 0 ? Number.POSITIVE_INFINITY : (tree.valueIndices[closest] ?? -1);
        const firstLeafRank = tree.firstLeafRanks[child] ?? 0;
        if (minimumDistance > childDistance || (minimumDistance === childDistance && closestRank > firstLeafRank)) {
            if ((tree.childCounts[child] ?? 0) === 0) {
                const leafRank = tree.valueIndices[child] ?? -1;
                if (minimumDistance > childDistance || (minimumDistance === childDistance && closestRank > leafRank)) {
                    stack.minimumDistances[depth] = childDistance;
                    stack.closestLeaves[depth] = child;
                }
            } else {
                depth++;
                stack.nodes[depth] = child;
                stack.nextChildren[depth] = tree.childStarts[child] ?? 0;
                const inheritedCandidate = stack.closestLeaves[depth - 1] ?? -1;
                stack.closestLeaves[depth] = inheritedCandidate;
                stack.minimumDistances[depth] =
                    inheritedCandidate < 0
                        ? Number.POSITIVE_INFINITY
                        : climateNodeDistance(tree, inheritedCandidate, target);
                stack.pendingChildren[depth] = child;
                stack.pendingDistances[depth] = childDistance;
            }
        }
    }
};

/** The lower-bound distance from a target to one flattened tree node. */
const climateNodeDistance = (tree: ClimateSearchArrays, node: number, target: ClimateTargetPoint): number => {
    const offset = node * CLIMATE_PARAMETER_COUNT * 2;
    let distance = parameterDistance(tree.bounds[offset] ?? 0, tree.bounds[offset + 1] ?? 0, target.temperature);
    let total = distance * distance;
    distance = parameterDistance(tree.bounds[offset + 2] ?? 0, tree.bounds[offset + 3] ?? 0, target.humidity);
    total += distance * distance;
    distance = parameterDistance(tree.bounds[offset + 4] ?? 0, tree.bounds[offset + 5] ?? 0, target.continentalness);
    total += distance * distance;
    distance = parameterDistance(tree.bounds[offset + 6] ?? 0, tree.bounds[offset + 7] ?? 0, target.erosion);
    total += distance * distance;
    distance = parameterDistance(tree.bounds[offset + 8] ?? 0, tree.bounds[offset + 9] ?? 0, target.depth);
    total += distance * distance;
    distance = parameterDistance(tree.bounds[offset + 10] ?? 0, tree.bounds[offset + 11] ?? 0, target.weirdness);
    total += distance * distance;
    distance = parameterDistance(tree.bounds[offset + 12] ?? 0, tree.bounds[offset + 13] ?? 0, 0);
    total += distance * distance;
    return total;
};

/** Flattens the object tree once so a lookup touches only typed arrays and a reusable stack. */
const flattenTree = <T>(root: TreeNode<T>): FlatClimateTree<T> => {
    const nodes: TreeNode<T>[] = [];
    const indices = new Map<TreeNode<T>, number>();
    let maxDepth = 0;

    const visit = (node: TreeNode<T>, depth: number): void => {
        indices.set(node, nodes.length);
        nodes.push(node);
        maxDepth = Math.max(maxDepth, depth);
        if (node instanceof TreeSubtree) {
            for (const child of node.children) visit(child, depth + 1);
        }
    };
    visit(root, 1);

    const bounds = new Float64Array(nodes.length * CLIMATE_PARAMETER_COUNT * 2);
    const childStarts = new Uint32Array(nodes.length);
    const childCounts = new Uint32Array(nodes.length);
    const children = new Uint32Array(nodes.length - 1);
    const valueIndices = new Int32Array(nodes.length);
    valueIndices.fill(-1);
    const firstLeafRanks = new Uint32Array(nodes.length);
    const values: T[] = [];
    let childCursor = 0;

    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
        const node = nodes[nodeIndex];
        if (node === undefined) throw new Error('Climate tree flattening lost a node');

        const boundsOffset = nodeIndex * CLIMATE_PARAMETER_COUNT * 2;
        for (let axis = 0; axis < CLIMATE_PARAMETER_COUNT; axis++) {
            const parameter = node.parameterSpace[axis];
            if (parameter === undefined) throw new Error(`Climate tree node is missing axis ${axis}`);
            bounds[boundsOffset + axis * 2] = parameter.min;
            bounds[boundsOffset + axis * 2 + 1] = parameter.max;
        }

        if (node instanceof TreeSubtree) {
            childStarts[nodeIndex] = childCursor;
            childCounts[nodeIndex] = node.children.length;
            for (const child of node.children) {
                const childIndex = indices.get(child);
                if (childIndex === undefined) throw new Error('Climate tree flattening lost a child index');
                children[childCursor] = childIndex;
                childCursor++;
            }
        } else if (node instanceof TreeLeaf) {
            valueIndices[nodeIndex] = values.length;
            firstLeafRanks[nodeIndex] = values.length;
            values.push(node.value);
        }
    }

    // Node indices are pre-order, so a reverse pass can copy each subtree's first leaf rank
    // from its first child without a second tree walk.
    for (let nodeIndex = nodes.length - 1; nodeIndex >= 0; nodeIndex--) {
        if ((valueIndices[nodeIndex] ?? -1) >= 0) continue;
        const firstChild = children[childStarts[nodeIndex] ?? 0];
        if (firstChild === undefined) throw new Error('Climate tree subtree has no first child');
        const rank = firstLeafRanks[firstChild];
        if (rank === undefined) throw new Error('Climate tree subtree lost its first leaf rank');
        firstLeafRanks[nodeIndex] = rank;
    }

    return { bounds, childStarts, childCounts, children, valueIndices, firstLeafRanks, values, maxDepth };
};

const buildParameterSpace = <T>(children: readonly TreeNode<T>[]): ClimateParameter[] => {
    if (children.length === 0) throw new RangeError('A search tree node needs at least one child');
    const bounds: (ClimateParameter | undefined)[] = new Array(CLIMATE_PARAMETER_COUNT).fill(undefined);
    for (const child of children) {
        for (let axis = 0; axis < CLIMATE_PARAMETER_COUNT; axis++) {
            bounds[axis] = spanOf(child.parameterSpace[axis] as ClimateParameter, bounds[axis]);
        }
    }
    return bounds as ClimateParameter[];
};

const sortByAxis = <T>(nodes: TreeNode<T>[], axis: number, absolute: boolean): void => {
    nodes.sort((left, right) => {
        for (let step = 0; step < CLIMATE_PARAMETER_COUNT; step++) {
            const current = (axis + step) % CLIMATE_PARAMETER_COUNT;
            const leftCenter = left.axisCenters[current] ?? 0;
            const rightCenter = right.axisCenters[current] ?? 0;
            const a = absolute ? Math.abs(leftCenter) : leftCenter;
            const b = absolute ? Math.abs(rightCenter) : rightCenter;
            if (a !== b) return a < b ? -1 : 1;
        }
        return 0;
    });
};

const bucketize = <T>(nodes: readonly TreeNode<T>[], childrenPerNode: number): TreeSubtree<T>[] => {
    const buckets: TreeSubtree<T>[] = [];
    let children: TreeNode<T>[] = [];
    const expected = Math.trunc(
        childrenPerNode ** Math.floor(Math.log(nodes.length - 0.01) / Math.log(childrenPerNode))
    );
    for (const child of nodes) {
        children.push(child);
        if (children.length >= expected) {
            buckets.push(new TreeSubtree(children));
            children = [];
        }
    }
    if (children.length > 0) buckets.push(new TreeSubtree(children));
    return buckets;
};

const nodeCost = (space: readonly ClimateParameter[]): number => {
    let total = 0;
    for (const parameter of space) total += Math.abs(parameter.max - parameter.min);
    return total;
};

const buildTree = <T>(children: TreeNode<T>[], childrenPerNode: number): TreeNode<T> => {
    if (children.length === 0) throw new RangeError('A search tree node needs at least one child');
    if (children.length === 1) return children[0] as TreeNode<T>;
    if (children.length <= childrenPerNode) {
        children.sort((left, right) => {
            let leftTotal = 0;
            let rightTotal = 0;
            for (let axis = 0; axis < CLIMATE_PARAMETER_COUNT; axis++) {
                leftTotal += Math.abs(left.axisCenters[axis] ?? 0);
                rightTotal += Math.abs(right.axisCenters[axis] ?? 0);
            }
            return leftTotal - rightTotal;
        });
        return new TreeSubtree(children);
    }

    let minCost = Number.POSITIVE_INFINITY;
    let minAxis = -1;
    let minBuckets: TreeSubtree<T>[] = [];
    for (let axis = 0; axis < CLIMATE_PARAMETER_COUNT; axis++) {
        sortByAxis(children, axis, false);
        const buckets = bucketize(children, childrenPerNode);
        let total = 0;
        for (const bucket of buckets) total += nodeCost(bucket.parameterSpace);
        if (minCost > total) {
            minCost = total;
            minAxis = axis;
            minBuckets = buckets;
        }
    }

    sortByAxis(minBuckets, minAxis, true);
    return new TreeSubtree(minBuckets.map((bucket) => buildTree([...bucket.children], childrenPerNode)));
};

/** One biome and the climate box that claims it. */
export interface ClimateEntry<T> {
    /** The box. */
    readonly point: ClimateParameterPoint;
    /** What the box resolves to, which for a biome source is a biome identifier. */
    readonly value: T;
}

/**
 * A list of climate boxes with the search tree Java builds over it.
 *
 * The tree is an exact nearest-box index, not an approximation: it skips a subtree when its
 * lower-bound distance is worse than the best box found so far, or when an equal bound contains
 * no leaf earlier in tree order. {@link findBruteForce} is the same query by linear scan, and the
 * two agree on the nearest distance for every target.
 *
 * Two boxes can sit at exactly the same distance from a target. Java breaks that tie in favor of
 * the box a thread found last, so its answer depends on that thread's earlier lookups. This list
 * keeps Java's prior-result seed for pruning, but uses the first depth-first leaf rank to settle
 * exact ties. A lookup then depends on the target alone, and chunks generated in any order see the
 * same biomes.
 */
export class ClimateParameterList<T> implements ClimateParameterIndex<T> {
    private readonly tree: ClimateSearchArrays;
    private readonly values: T[];
    private lastResult = -1;
    private readonly searchStack: ClimateSearchStack;

    public constructor(
        /** The boxes, in the order the data pack lists them. */
        public readonly entries: readonly ClimateEntry<T>[],
        childrenPerNode = CLIMATE_CHILDREN_PER_NODE
    ) {
        if (entries.length === 0) throw new RangeError('A climate parameter list needs at least one entry');
        const leaves = entries.map((entry) => new TreeLeaf(entry.point, entry.value));
        const tree = flattenTree(buildTree<T>(leaves, childrenPerNode));
        this.tree = tree;
        this.values = tree.values;
        // Searches are synchronous, so one instance-owned stack avoids allocating a frame per lookup.
        this.searchStack = createClimateSearchStack(tree.maxDepth);
    }

    /** Returns the value of the nearest box, breaking exact ties by first tree order. */
    public find(target: ClimateTargetPoint): T {
        const leaf = closestLeaf(this.tree, this.searchStack, this.lastResult, target);
        this.lastResult = leaf;
        const valueIndex = this.tree.valueIndices[leaf] ?? -1;
        // Flattening assigns every leaf one dense value-table index.
        return this.values[valueIndex] as T;
    }

    /** Returns the value of the box nearest the target by scanning every box. */
    public findBruteForce(target: ClimateTargetPoint): T {
        const first = this.entries[0] as ClimateEntry<T>;
        let best = first.value;
        let bestFitness = climateFitness(first.point, target);
        for (let index = 1; index < this.entries.length; index++) {
            const entry = this.entries[index] as ClimateEntry<T>;
            const fitness = climateFitness(entry.point, target);
            if (fitness < bestFitness) {
                bestFitness = fitness;
                best = entry.value;
            }
        }
        return best;
    }

    /** Returns unique entry values in first-occurrence order. */
    public distinctValues(): readonly T[] {
        return [...new Set(this.entries.map(({ value }) => value))];
    }

    /**
     * Copies this string-valued climate tree into a read-only-by-convention shared buffer.
     *
     * The worker receives a handle to the same flattened search arrays instead of rebuilding
     * the 7594-entry tree and retaining a second object graph. The source entries remain in the
     * buffer so diagnostics can still materialize `entries` and run the brute-force oracle.
     */
    public toSharedArrayBuffer(this: ClimateParameterList<string>): SharedArrayBuffer {
        if (typeof SharedArrayBuffer === 'undefined') {
            throw new Error('SharedArrayBuffer is not available in this runtime');
        }

        const entryCount = this.entries.length;
        const nodeCount = this.tree.valueIndices.length;
        const distinctValues = [...new Set(this.entries.map(({ value }) => value))];
        const valueIds = new Map(distinctValues.map((value, index) => [value, index]));
        const treeValueIndices = Uint32Array.from(this.values, (value) => {
            const valueIndex = valueIds.get(value);
            if (valueIndex === undefined) throw new Error('Climate tree contains a value absent from its entries');
            return valueIndex;
        });
        const entryValueIndices = Uint32Array.from(this.entries, ({ value }) => {
            const valueIndex = valueIds.get(value);
            if (valueIndex === undefined) throw new Error('Climate entry contains a value absent from its table');
            return valueIndex;
        });
        const entryBounds = new Float64Array(entryCount * CLIMATE_PARAMETER_COUNT * 2);
        for (let index = 0; index < entryCount; index++) {
            const entry = this.entries[index];
            if (entry === undefined) throw new Error(`Climate table is missing entry ${index}`);
            const parameters = parameterSpaceOf(entry.point);
            for (let axis = 0; axis < CLIMATE_PARAMETER_COUNT; axis++) {
                const parameter = parameters[axis];
                if (parameter === undefined) throw new Error(`Climate entry ${index} is missing axis ${axis}`);
                const offset = index * CLIMATE_PARAMETER_COUNT * 2 + axis * 2;
                entryBounds[offset] = parameter.min;
                entryBounds[offset + 1] = parameter.max;
            }
        }

        const encodedValues = new TextEncoder().encode(JSON.stringify(distinctValues));
        const offsets = sharedClimateOffsets(nodeCount, entryCount);
        const totalBytes = offsets.byteLength + encodedValues.byteLength;
        const buffer = new SharedArrayBuffer(totalBytes);
        const header = new DataView(buffer);
        header.setUint32(0, SHARED_CLIMATE_MAGIC, true);
        header.setUint32(4, SHARED_CLIMATE_VERSION, true);
        header.setUint32(8, nodeCount, true);
        header.setUint32(12, entryCount, true);
        header.setUint32(16, distinctValues.length, true);
        header.setUint32(20, this.searchStack.nodes.length, true);
        header.setUint32(24, encodedValues.byteLength, true);
        header.setUint32(28, totalBytes, true);
        header.setUint32(32, offsets.bounds, true);
        header.setUint32(36, offsets.childStarts, true);
        header.setUint32(40, offsets.childCounts, true);
        header.setUint32(44, offsets.children, true);
        header.setUint32(48, offsets.valueIndices, true);
        header.setUint32(52, offsets.firstLeafRanks, true);
        header.setUint32(56, offsets.treeValueIndices, true);
        header.setUint32(60, offsets.entryBounds, true);

        new Float64Array(buffer, offsets.bounds, this.tree.bounds.length).set(this.tree.bounds);
        new Uint32Array(buffer, offsets.childStarts, this.tree.childStarts.length).set(this.tree.childStarts);
        new Uint32Array(buffer, offsets.childCounts, this.tree.childCounts.length).set(this.tree.childCounts);
        new Uint32Array(buffer, offsets.children, this.tree.children.length).set(this.tree.children);
        new Int32Array(buffer, offsets.valueIndices, this.tree.valueIndices.length).set(this.tree.valueIndices);
        new Uint32Array(buffer, offsets.firstLeafRanks, this.tree.firstLeafRanks.length).set(this.tree.firstLeafRanks);
        new Uint32Array(buffer, offsets.treeValueIndices, treeValueIndices.length).set(treeValueIndices);
        new Float64Array(buffer, offsets.entryBounds, entryBounds.length).set(entryBounds);
        new Uint32Array(buffer, offsets.entryValueIndices, entryValueIndices.length).set(entryValueIndices);
        new Uint8Array(buffer, offsets.values, encodedValues.length).set(encodedValues);

        return buffer;
    }
}

/** Reads one climate tree from a shared buffer without rebuilding its object tree. */
export class SharedClimateParameterList implements ClimateParameterIndex<string> {
    private readonly tree: ClimateSearchArrays;
    private readonly treeValueIndices: Uint32Array;
    private readonly entryBounds: Float64Array;
    private readonly entryValueIndices: Uint32Array;
    private readonly values: readonly string[];
    private readonly searchStack: ClimateSearchStack;
    private lastResult = -1;
    private materializedEntries: readonly ClimateEntry<string>[] | undefined;

    /**
     * Maps the packed search arrays without copying them.
     *
     * @param buffer - The shared table emitted by {@link ClimateParameterList.toSharedArrayBuffer}.
     * @throws TypeError when the buffer has an unsupported version, invalid offsets, or an invalid value dictionary.
     */
    public constructor(buffer: SharedArrayBuffer) {
        if (buffer.byteLength < SHARED_CLIMATE_HEADER_BYTES) {
            throw new TypeError('Shared climate table is shorter than its header');
        }

        const header = new DataView(buffer);
        if (header.getUint32(0, true) !== SHARED_CLIMATE_MAGIC)
            throw new TypeError('Shared climate table has bad magic');
        if (header.getUint32(4, true) !== SHARED_CLIMATE_VERSION) {
            throw new TypeError(`Shared climate table version ${header.getUint32(4, true)} is unsupported`);
        }

        const nodeCount = header.getUint32(8, true);
        const entryCount = header.getUint32(12, true);
        const valueCount = header.getUint32(16, true);
        const maxDepth = header.getUint32(20, true);
        const encodedValuesLength = header.getUint32(24, true);
        const totalBytes = header.getUint32(28, true);
        if (nodeCount === 0 || entryCount === 0 || valueCount === 0 || maxDepth === 0) {
            throw new TypeError('Shared climate table has empty dimensions');
        }
        const offsets = sharedClimateOffsets(nodeCount, entryCount);
        if (
            header.getUint32(32, true) !== offsets.bounds ||
            header.getUint32(36, true) !== offsets.childStarts ||
            header.getUint32(40, true) !== offsets.childCounts ||
            header.getUint32(44, true) !== offsets.children ||
            header.getUint32(48, true) !== offsets.valueIndices ||
            header.getUint32(52, true) !== offsets.firstLeafRanks ||
            header.getUint32(56, true) !== offsets.treeValueIndices ||
            header.getUint32(60, true) !== offsets.entryBounds ||
            totalBytes !== offsets.byteLength + encodedValuesLength ||
            totalBytes !== buffer.byteLength
        ) {
            throw new TypeError('Shared climate table has inconsistent lengths or offsets');
        }

        const entryValueOffset =
            offsets.entryBounds + entryCount * CLIMATE_PARAMETER_COUNT * 2 * Float64Array.BYTES_PER_ELEMENT;
        const valueOffset = entryValueOffset + entryCount * Uint32Array.BYTES_PER_ELEMENT;
        const encodedValues = new Uint8Array(buffer, valueOffset, encodedValuesLength);
        const decodedValues: unknown = JSON.parse(new TextDecoder().decode(encodedValues));
        if (
            !Array.isArray(decodedValues) ||
            !decodedValues.every((value): value is string => typeof value === 'string')
        ) {
            throw new TypeError('Shared climate table contains an invalid value dictionary');
        }
        if (decodedValues.length !== valueCount) throw new TypeError('Shared climate table value count does not match');

        // SharedArrayBuffer has no read-only mode; only the per-instance search stack is mutable.
        this.tree = {
            bounds: new Float64Array(buffer, offsets.bounds, nodeCount * CLIMATE_PARAMETER_COUNT * 2),
            childStarts: new Uint32Array(buffer, offsets.childStarts, nodeCount),
            childCounts: new Uint32Array(buffer, offsets.childCounts, nodeCount),
            children: new Uint32Array(buffer, offsets.children, nodeCount - 1),
            valueIndices: new Int32Array(buffer, offsets.valueIndices, nodeCount),
            firstLeafRanks: new Uint32Array(buffer, offsets.firstLeafRanks, nodeCount)
        };
        this.treeValueIndices = new Uint32Array(buffer, offsets.treeValueIndices, entryCount);
        this.entryBounds = new Float64Array(buffer, offsets.entryBounds, entryCount * CLIMATE_PARAMETER_COUNT * 2);
        this.entryValueIndices = new Uint32Array(buffer, entryValueOffset, entryCount);
        this.values = decodedValues;
        this.searchStack = createClimateSearchStack(maxDepth);
    }

    /** Source entries, materialized only when a caller asks for them. */
    public get entries(): readonly ClimateEntry<string>[] {
        if (this.materializedEntries !== undefined) return this.materializedEntries;

        this.materializedEntries = Array.from(this.entryValueIndices, (valueIndex, index) => ({
            point: pointFromFlat(this.entryBounds, index * CLIMATE_PARAMETER_COUNT * 2),
            value: this.valueAt(valueIndex)
        }));
        return this.materializedEntries;
    }

    /** Returns the value of the nearest box, breaking exact ties by first tree order. */
    public find(target: ClimateTargetPoint): string {
        const leaf = closestLeaf(this.tree, this.searchStack, this.lastResult, target);
        this.lastResult = leaf;
        const valueIndex = this.tree.valueIndices[leaf] ?? -1;
        const dictionaryIndex = this.treeValueIndices[valueIndex] ?? -1;
        return this.valueAt(dictionaryIndex);
    }

    /** Returns the value of the nearest box by scanning each source entry in order. */
    public findBruteForce(target: ClimateTargetPoint): string {
        let best = 0;
        let bestFitness = climateFitnessFromFlat(this.entryBounds, 0, target);
        for (let index = 1; index < this.entryValueIndices.length; index++) {
            const fitness = climateFitnessFromFlat(this.entryBounds, index * CLIMATE_PARAMETER_COUNT * 2, target);
            if (fitness < bestFitness) {
                bestFitness = fitness;
                best = index;
            }
        }
        return this.valueAt(this.entryValueIndices[best] ?? -1);
    }

    /** Returns unique entry values in first-occurrence order. */
    public distinctValues(): readonly string[] {
        return [...this.values];
    }

    private valueAt(index: number): string {
        const value = this.values[index];
        if (value === undefined) throw new TypeError(`Shared climate table has no value at index ${index}`);
        return value;
    }
}

/** Rebuilds a climate point from the seven min/max pairs stored in shared memory. */
const pointFromFlat = (bounds: Float64Array, offset: number): ClimateParameterPoint => ({
    temperature: { min: bounds[offset] ?? 0, max: bounds[offset + 1] ?? 0 },
    humidity: { min: bounds[offset + 2] ?? 0, max: bounds[offset + 3] ?? 0 },
    continentalness: { min: bounds[offset + 4] ?? 0, max: bounds[offset + 5] ?? 0 },
    erosion: { min: bounds[offset + 6] ?? 0, max: bounds[offset + 7] ?? 0 },
    depth: { min: bounds[offset + 8] ?? 0, max: bounds[offset + 9] ?? 0 },
    weirdness: { min: bounds[offset + 10] ?? 0, max: bounds[offset + 11] ?? 0 },
    offset: bounds[offset + 12] ?? 0
});

/** The fitness of a target against one climate point stored as flat min/max pairs. */
const climateFitnessFromFlat = (bounds: Float64Array, offset: number, target: ClimateTargetPoint): number => {
    let distance = parameterDistance(bounds[offset] ?? 0, bounds[offset + 1] ?? 0, target.temperature);
    let total = distance * distance;
    distance = parameterDistance(bounds[offset + 2] ?? 0, bounds[offset + 3] ?? 0, target.humidity);
    total += distance * distance;
    distance = parameterDistance(bounds[offset + 4] ?? 0, bounds[offset + 5] ?? 0, target.continentalness);
    total += distance * distance;
    distance = parameterDistance(bounds[offset + 6] ?? 0, bounds[offset + 7] ?? 0, target.erosion);
    total += distance * distance;
    distance = parameterDistance(bounds[offset + 8] ?? 0, bounds[offset + 9] ?? 0, target.depth);
    total += distance * distance;
    distance = parameterDistance(bounds[offset + 10] ?? 0, bounds[offset + 11] ?? 0, target.weirdness);
    total += distance * distance;
    distance = parameterDistance(bounds[offset + 12] ?? 0, bounds[offset + 13] ?? 0, 0);
    total += distance * distance;
    return total;
};

/**
 * Reads one axis in any of the three shapes Java's `Climate.Parameter` codec accepts: a single
 * number, a `{min, max}` object, or the `[min, max]` list that `BiomeParametersDumpReport`
 * writes into `reports/biome_parameters`.
 */
const parseParameter = (source: unknown, path: string): ClimateParameter => {
    if (typeof source === 'number') return climatePoint(source);
    if (Array.isArray(source)) {
        if (source.length !== 2) {
            throw new TypeError(`${path}: expected [min, max], got ${JSON.stringify(source)}`);
        }
        return climateSpan(number(source[0], `${path}[0]`), number(source[1], `${path}[1]`));
    }
    const raw = asObject(source, path);
    return climateSpan(number(raw['min'], `${path}.min`), number(raw['max'], `${path}.max`));
};

/**
 * Reads one `parameters` object of a `multi_noise_biome_source_parameter_list` document or of
 * a `reports/biome_parameters` entry. Each axis may be a number, `{min, max}` or `[min, max]`.
 *
 * @throws When an axis is missing or has the wrong shape.
 */
export const parseClimateParameterPoint = (source: unknown, path = '<parameters>'): ClimateParameterPoint => {
    const raw = asObject(source, path);
    return {
        temperature: parseParameter(raw['temperature'], `${path}.temperature`),
        humidity: parseParameter(raw['humidity'], `${path}.humidity`),
        continentalness: parseParameter(raw['continentalness'], `${path}.continentalness`),
        erosion: parseParameter(raw['erosion'], `${path}.erosion`),
        depth: parseParameter(raw['depth'], `${path}.depth`),
        weirdness: parseParameter(raw['weirdness'], `${path}.weirdness`),
        offset: quantizeClimateCoord(number(raw['offset'], `${path}.offset`))
    };
};
