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
const parameterDistance = (parameter: ClimateParameter, target: number): number => {
    const above = target - parameter.max;
    const below = parameter.min - target;
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

/** The seven axes of a target point; the offset axis is always zero. */
const targetArray = (target: ClimateTargetPoint): number[] => [
    target.temperature,
    target.humidity,
    target.continentalness,
    target.erosion,
    target.depth,
    target.weirdness,
    0
];

/**
 * The squared distance from a target to a parameter point, which is what "nearest biome"
 * means.
 */
export const climateFitness = (point: ClimateParameterPoint, target: ClimateTargetPoint): number => {
    const space = parameterSpaceOf(point);
    const values = targetArray(target);
    let total = 0;
    for (let axis = 0; axis < CLIMATE_PARAMETER_COUNT; axis++) {
        const distance = parameterDistance(space[axis] as ClimateParameter, values[axis] as number);
        total += distance * distance;
    }
    return total;
};

abstract class TreeNode<T> {
    public constructor(public readonly parameterSpace: readonly ClimateParameter[]) {}

    /** The lower bound on the distance from the target to anything inside this node. */
    public distance(target: readonly number[]): number {
        let total = 0;
        for (let axis = 0; axis < CLIMATE_PARAMETER_COUNT; axis++) {
            const value = parameterDistance(this.parameterSpace[axis] as ClimateParameter, target[axis] as number);
            total += value * value;
        }
        return total;
    }

    public abstract search(target: readonly number[], candidate: TreeLeaf<T> | undefined): TreeLeaf<T>;
}

class TreeLeaf<T> extends TreeNode<T> {
    public constructor(
        point: ClimateParameterPoint,
        public readonly value: T
    ) {
        super(parameterSpaceOf(point));
    }

    public search(): TreeLeaf<T> {
        return this;
    }
}

class TreeSubtree<T> extends TreeNode<T> {
    public constructor(
        public readonly children: readonly TreeNode<T>[],
        parameterSpace?: readonly ClimateParameter[]
    ) {
        super(parameterSpace ?? buildParameterSpace(children));
    }

    public search(target: readonly number[], candidate: TreeLeaf<T> | undefined): TreeLeaf<T> {
        let minDistance = candidate === undefined ? Number.POSITIVE_INFINITY : candidate.distance(target);
        let closest = candidate;
        for (const child of this.children) {
            const childDistance = child.distance(target);
            if (minDistance > childDistance) {
                const leaf = child.search(target, closest);
                const leafDistance = child === leaf ? childDistance : leaf.distance(target);
                if (minDistance > leafDistance) {
                    minDistance = leafDistance;
                    closest = leaf;
                }
            }
        }
        // A subtree always holds at least one leaf, so the search cannot come back empty.
        return closest as TreeLeaf<T>;
    }
}

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
 * The tree is an exact nearest-box index, not an approximation: it only skips a subtree whose
 * lower-bound distance already exceeds the best box found so far. {@link findBruteForce} is
 * the same query by linear scan, and the two agree for every target.
 *
 * One query seeds the next with its result, as Java's per-thread `lastResult` does, so a
 * sequence of lookups has to be replayed in order to reproduce how ties are broken.
 */
export class ClimateParameterList<T> {
    private readonly root: TreeNode<T>;
    private lastResult: TreeLeaf<T> | undefined;

    public constructor(
        /** The boxes, in the order the data pack lists them. */
        public readonly entries: readonly ClimateEntry<T>[],
        childrenPerNode = CLIMATE_CHILDREN_PER_NODE
    ) {
        if (entries.length === 0) throw new RangeError('A climate parameter list needs at least one entry');
        const leaves = entries.map((entry) => new TreeLeaf(entry.point, entry.value));
        this.root = buildTree<T>(leaves, childrenPerNode);
    }

    /** Returns the value of the box nearest the target, through the search tree. */
    public find(target: ClimateTargetPoint): T {
        const leaf = this.root.search(targetArray(target), this.lastResult);
        this.lastResult = leaf;
        return leaf.value;
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

/** Reads one axis, which Java writes either as a single number or as a `{min, max}` object. */
const parseParameter = (source: unknown, path: string): ClimateParameter => {
    if (typeof source === 'number') return climatePoint(source);
    const raw = asObject(source, path);
    return climateSpan(number(raw['min'], `${path}.min`), number(raw['max'], `${path}.max`));
};

/**
 * Reads one `parameters` object of a `multi_noise_biome_source_parameter_list` document.
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
