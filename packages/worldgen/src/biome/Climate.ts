import { f32 } from '../math';

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

    public constructor(public readonly parameterSpace: readonly ClimateParameter[]) {}
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

/** The center of one axis of a node's box, truncated the way Java's `long` division is. */
const axisCenter = (node: TreeNode<unknown>, axis: number): number => {
    const parameter = node.parameterSpace[axis] as ClimateParameter;
    return Math.trunc((parameter.min + parameter.max) / 2);
};

const sortByAxis = <T>(nodes: TreeNode<T>[], axis: number, absolute: boolean): void => {
    nodes.sort((left, right) => {
        for (let step = 0; step < CLIMATE_PARAMETER_COUNT; step++) {
            const current = (axis + step) % CLIMATE_PARAMETER_COUNT;
            const a = absolute ? Math.abs(axisCenter(left, current)) : axisCenter(left, current);
            const b = absolute ? Math.abs(axisCenter(right, current)) : axisCenter(right, current);
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
                leftTotal += Math.abs(axisCenter(left, axis));
                rightTotal += Math.abs(axisCenter(right, axis));
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
export class ClimateParameterList<T> {
    private readonly bounds: Float64Array;
    private readonly childStarts: Uint32Array;
    private readonly childCounts: Uint32Array;
    private readonly children: Uint32Array;
    private readonly valueIndices: Int32Array;
    private readonly firstLeafRanks: Uint32Array;
    private readonly values: T[];
    private lastResult = -1;
    private readonly searchStack: {
        readonly nodes: Uint32Array;
        readonly nextChildren: Uint32Array;
        readonly minimumDistances: Float64Array;
        readonly closestLeaves: Int32Array;
        readonly pendingChildren: Uint32Array;
        readonly pendingDistances: Float64Array;
    };

    public constructor(
        /** The boxes, in the order the data pack lists them. */
        public readonly entries: readonly ClimateEntry<T>[],
        childrenPerNode = CLIMATE_CHILDREN_PER_NODE
    ) {
        if (entries.length === 0) throw new RangeError('A climate parameter list needs at least one entry');
        const leaves = entries.map((entry) => new TreeLeaf(entry.point, entry.value));
        const tree = flattenTree(buildTree<T>(leaves, childrenPerNode));
        this.bounds = tree.bounds;
        this.childStarts = tree.childStarts;
        this.childCounts = tree.childCounts;
        this.children = tree.children;
        this.valueIndices = tree.valueIndices;
        this.firstLeafRanks = tree.firstLeafRanks;
        this.values = tree.values;
        // Searches are synchronous, so one instance-owned stack avoids allocating a frame per lookup.
        this.searchStack = {
            nodes: new Uint32Array(tree.maxDepth),
            nextChildren: new Uint32Array(tree.maxDepth),
            minimumDistances: new Float64Array(tree.maxDepth),
            closestLeaves: new Int32Array(tree.maxDepth),
            pendingChildren: new Uint32Array(tree.maxDepth),
            pendingDistances: new Float64Array(tree.maxDepth)
        };
    }

    /** Returns the value of the nearest box, breaking exact ties by first tree order. */
    public find(target: ClimateTargetPoint): T {
        const stack = this.searchStack;
        let depth = 0;
        let returnedLeaf = -1;
        const candidate = this.lastResult;
        stack.nodes[0] = 0;
        stack.nextChildren[0] = this.childStarts[0] ?? 0;
        stack.minimumDistances[0] = candidate < 0 ? Number.POSITIVE_INFINITY : this.distance(candidate, target);
        stack.closestLeaves[0] = candidate;

        for (;;) {
            if (returnedLeaf >= 0) {
                if (depth === 0) {
                    this.lastResult = returnedLeaf;
                    const valueIndex = this.valueIndices[returnedLeaf] ?? -1;
                    // Flattening assigns every leaf one dense value-table index.
                    return this.values[valueIndex] as T;
                }

                depth--;
                const child = stack.pendingChildren[depth + 1] ?? 0;
                const childDistance = stack.pendingDistances[depth + 1] ?? Number.POSITIVE_INFINITY;
                const leafDistance = child === returnedLeaf ? childDistance : this.distance(returnedLeaf, target);
                const parentMinimum = stack.minimumDistances[depth] ?? Number.POSITIVE_INFINITY;
                const parentClosest = stack.closestLeaves[depth] ?? -1;
                const parentRank = parentClosest < 0 ? Number.POSITIVE_INFINITY : (this.valueIndices[parentClosest] ?? -1);
                const leafRank = this.valueIndices[returnedLeaf] ?? -1;
                if (parentMinimum > leafDistance || (parentMinimum === leafDistance && parentRank > leafRank)) {
                    stack.minimumDistances[depth] = leafDistance;
                    stack.closestLeaves[depth] = returnedLeaf;
                }
                returnedLeaf = -1;
                continue;
            }

            const node = stack.nodes[depth] ?? 0;
            const childCount = this.childCounts[node] ?? 0;
            if (childCount === 0) {
                returnedLeaf = node;
                continue;
            }

            const nextChild = stack.nextChildren[depth] ?? 0;
            const childEnd = (this.childStarts[node] ?? 0) + childCount;
            if (nextChild >= childEnd) {
                returnedLeaf = stack.closestLeaves[depth] ?? -1;
                if (returnedLeaf < 0) throw new Error('A climate search subtree produced no leaf');
                continue;
            }

            const child = this.children[nextChild] ?? 0;
            stack.nextChildren[depth] = nextChild + 1;
            const childDistance = this.distance(child, target);
            const minimumDistance = stack.minimumDistances[depth] ?? Number.POSITIVE_INFINITY;
            const closest = stack.closestLeaves[depth] ?? -1;
            const closestRank = closest < 0 ? Number.POSITIVE_INFINITY : (this.valueIndices[closest] ?? -1);
            const firstLeafRank = this.firstLeafRanks[child] ?? 0;
            if (
                minimumDistance > childDistance ||
                (minimumDistance === childDistance && closestRank > firstLeafRank)
            ) {
                if ((this.childCounts[child] ?? 0) === 0) {
                    const leafRank = this.valueIndices[child] ?? -1;
                    if (minimumDistance > childDistance || (minimumDistance === childDistance && closestRank > leafRank)) {
                        stack.minimumDistances[depth] = childDistance;
                        stack.closestLeaves[depth] = child;
                    }
                } else {
                    depth++;
                    stack.nodes[depth] = child;
                    stack.nextChildren[depth] = this.childStarts[child] ?? 0;
                    const inheritedCandidate = stack.closestLeaves[depth - 1] ?? -1;
                    stack.closestLeaves[depth] = inheritedCandidate;
                    stack.minimumDistances[depth] =
                        inheritedCandidate < 0 ? Number.POSITIVE_INFINITY : this.distance(inheritedCandidate, target);
                    stack.pendingChildren[depth] = child;
                    stack.pendingDistances[depth] = childDistance;
                }
            }
        }
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

    /** The target's lower-bound distance from one flattened node's seven climate ranges. */
    private distance(node: number, target: ClimateTargetPoint): number {
        const offset = node * CLIMATE_PARAMETER_COUNT * 2;
        let distance = parameterDistance(this.bounds[offset] ?? 0, this.bounds[offset + 1] ?? 0, target.temperature);
        let total = distance * distance;
        distance = parameterDistance(this.bounds[offset + 2] ?? 0, this.bounds[offset + 3] ?? 0, target.humidity);
        total += distance * distance;
        distance = parameterDistance(
            this.bounds[offset + 4] ?? 0,
            this.bounds[offset + 5] ?? 0,
            target.continentalness
        );
        total += distance * distance;
        distance = parameterDistance(this.bounds[offset + 6] ?? 0, this.bounds[offset + 7] ?? 0, target.erosion);
        total += distance * distance;
        distance = parameterDistance(this.bounds[offset + 8] ?? 0, this.bounds[offset + 9] ?? 0, target.depth);
        total += distance * distance;
        distance = parameterDistance(this.bounds[offset + 10] ?? 0, this.bounds[offset + 11] ?? 0, target.weirdness);
        total += distance * distance;
        distance = parameterDistance(this.bounds[offset + 12] ?? 0, this.bounds[offset + 13] ?? 0, 0);
        total += distance * distance;
        return total;
    }
}

const asObject = (value: unknown, path: string): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError(`${path}: expected an object, got ${JSON.stringify(value)}`);
    }
    // A parsed JSON document is `unknown`; every field read below is checked.
    return value as Record<string, unknown>;
};

const number = (value: unknown, path: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${path}: expected a finite number, got ${JSON.stringify(value)}`);
    }
    return value;
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
