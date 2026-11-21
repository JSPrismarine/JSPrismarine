import type { NativeNoiseStack } from '@jsprismarine/native-worldgen';

import { f32 } from '../math';
import type { BlendedNoiseMultipliers } from '../noise/BlendedNoise';
import type { Noise } from '../noise/GradientNoise';
import { NativeStackNoise } from '../noise/nativeNoise';
import type { DensityFunctionNode, SplineNode } from './DensityFunction';

/**
 * The operations of a point program, which `native/src/density.c` in `@jsprismarine/native-worldgen`
 * runs one position at a time. Each is a closure in `compile.ts`, with the same arithmetic.
 */
export const PointOp = {
    /** `a`: the constant. */
    constant: 0,
    /** `a`: the input; `b`: the memo slot. Remembers the last position's value. */
    cachePoint: 1,
    /** `a`: the input, which ignores y; `b`: the memo slot. Remembers a value per column. */
    cacheColumn: 2,
    /** `a`: the axis; `b`: the tiling; `c`: six constants (from value, factor, from coordinate, min, max, range). */
    gradient: 3,
    /** `a`: the stack; `b`, `c`, `d`: the x, y and z shift nodes or -1; `e`: two constants (xz and y scale). */
    noise: 4,
    /** `a`: the stack; `b`: 0 shift, 1 shift_a, 2 shift_b. */
    shift: 5,
    /** `a`, `b`, `c`: the low, high and selector stacks; `d`: four constants (the multipliers). */
    blended: 6,
    /** `a`: the input; `b`: the kind, in {@link UNARY_KINDS}' order. */
    unary: 7,
    /** `a`, `b`: the sides; `c`: add, sub, mul, div, min, max. */
    binary: 8,
    /** `a`: the input; `b`: the constant; `c`: v + k, k - v, v * k, k / v, min, max. */
    binaryConstant: 9,
    /** `a`: the input; `b`: floor, ceil, round, truncate; `c`: the multiple node, or -1 for 1. */
    round: 10,
    /** `a`: the input; `b`, `c`: the min and max constants. */
    clamp: 11,
    /** `a`: the alpha; `b`, `c`: the two ends. */
    lerp: 12,
    /** `a`: the input; `b`, `c`: the bounds; `d`, `e`: the in-range and out-of-range nodes. */
    rangeChoice: 13,
    /** `a`: the input; `b`: the thresholds; `c`: the function links; `d`: their count; `e`: the threshold count. */
    intervalSelect: 14,
    /** `a`: the input; `b`: the axis; `c`: the fixed coordinate. */
    slice: 15,
    /** `a`: the constant. */
    splineConstant: 16,
    /** `a`: the coordinate; `b`: the point count; `c`: locations then derivatives; `d`: the value links. */
    spline: 17,
    /** `a`: the metric; `b`: the point's three constants. */
    distance: 18,
    /** `a`: the density; `b`: the upper bound; `c`: two constants (lower bound, cell height). */
    findTopSurface: 19,
    /** `a`: the constant a hook answers when no structure or blending is in play. */
    neutralHook: 20,
    /** `a`: the input, which `blend_density` passes through when no blending is in play. */
    blendDensity: 21
} as const;

/** The 32-bit words of one record: the operation, then up to five operands. */
export const POINT_NODE_WORDS = 6;

const UNARY_KINDS = [
    'abs',
    'square',
    'cube',
    'sqrt',
    'half_negative',
    'quarter_negative',
    'reciprocal',
    'negate',
    'squeeze',
    'sign'
] as const;
const AXES = { x: 0, y: 1, z: 2 } as const;
const TILINGS = { clamp_to_edge: 0, repeat: 1, mirrored_repeat: 2 } as const;
const ROUNDINGS = { floor: 0, ceil: 1, round: 2, truncate: 3 } as const;
const METRICS = { euclidean: 0, euclidean_squared: 1, manhattan: 2, chebyshev: 3 } as const;

/** What the encoder needs from the compiler: the seed's noises and which trees ignore y. */
export interface PointProgramSource {
    /** The seeded noise for a `worldgen/noise` identifier. */
    noise(id: string): Noise;
    /** The low, high and selector stacks of an `old_blended_noise` node, and its multipliers. */
    blendedNoise(node: DensityFunctionNode & { type: 'old_blended_noise' }): {
        readonly stacks: readonly [Noise, Noise, Noise];
        readonly multipliers: BlendedNoiseMultipliers;
    };
    /** Whether a tree reads no y, so a `cache` over it holds one value per column. */
    ignoresY(node: DensityFunctionNode): boolean;
}

/** A tree laid out as point program records, for `NativeWorldgen.createProgram`. */
export interface PointProgram {
    readonly nodes: Int32Array;
    readonly constants: Float64Array;
    readonly links: Int32Array;
    readonly stacks: readonly NativeNoiseStack[];
    readonly cacheSlots: number;
}

/** A node the native interpreter has no operation for, which keeps the tree in TypeScript. */
class NotNative {}

/**
 * Lays a density function tree out as a point program, or answers undefined when some node has
 * no native operation: `pow` and `log`, whose results V8 and libm do not always round alike, the
 * end islands' simplex noise, a nested `interpolated` node, or a noise that runs in TypeScript.
 * @param root - The tree.
 * @param source - The compiler's view of the seed.
 * @returns The program, or undefined to keep the tree on its closures.
 */
export const encodePointProgram = (root: DensityFunctionNode, source: PointProgramSource): PointProgram | undefined => {
    const encoder = new Encoder(source);
    try {
        encoder.node(root);
    } catch (error: unknown) {
        if (error instanceof NotNative) return undefined;
        throw error;
    }
    return {
        nodes: Int32Array.from(encoder.words),
        constants: Float64Array.from(encoder.constantValues),
        links: Int32Array.from(encoder.linkValues),
        stacks: encoder.stacks,
        cacheSlots: encoder.cacheSlots
    };
};

class Encoder {
    public readonly words: number[] = [];
    public readonly constantValues: number[] = [];
    public readonly linkValues: number[] = [];
    public readonly stacks: NativeNoiseStack[] = [];
    public cacheSlots = 0;
    private readonly indices = new Map<DensityFunctionNode | SplineNode, number>();
    private readonly stackIndices = new Map<NativeNoiseStack, number>();

    public constructor(private readonly source: PointProgramSource) {}

    /** The index of a node's record, laying it out on first sight; the first node is the root. */
    public node(node: DensityFunctionNode): number {
        // A spline node is its spline's record.
        if (node.type === 'spline') return this.spline(node.spline);
        return this.record(node, () => this.encode(node));
    }

    private record(key: DensityFunctionNode | SplineNode, encode: () => number[]): number {
        const existing = this.indices.get(key);
        if (existing !== undefined) return existing;
        const index = this.words.length / POINT_NODE_WORDS;
        this.indices.set(key, index);
        // Reserved before the operands, so the index is fixed while they are laid out.
        this.words.push(0, 0, 0, 0, 0, 0);
        const record = encode();
        for (let word = 0; word < POINT_NODE_WORDS; word++) {
            this.words[index * POINT_NODE_WORDS + word] = record[word] ?? 0;
        }
        return index;
    }

    /** The index of a run of constants, stored exactly as given. */
    private constants(...values: number[]): number {
        const start = this.constantValues.length;
        this.constantValues.push(...values);
        return start;
    }

    private links(indices: readonly number[]): number {
        const start = this.linkValues.length;
        this.linkValues.push(...indices);
        return start;
    }

    private stack(noise: Noise): number {
        if (!(noise instanceof NativeStackNoise)) throw new NotNative();
        const native = noise.native;
        const existing = this.stackIndices.get(native);
        if (existing !== undefined) return existing;
        this.stacks.push(native);
        this.stackIndices.set(native, this.stacks.length - 1);
        return this.stacks.length - 1;
    }

    private spline(spline: SplineNode): number {
        return this.record(spline, () => {
            if (spline.kind === 'constant') return [PointOp.splineConstant, this.constants(f32(spline.value))];
            const coordinate = this.node(spline.coordinate);
            const values = spline.values.map((value) => this.spline(value));
            // The closure holds both as Float32Arrays.
            const constants = this.constants(...spline.locations.map(f32), ...spline.derivatives.map(f32));
            return [PointOp.spline, coordinate, spline.locations.length, constants, this.links(values)];
        });
    }

    /** One node's record, each case the closure `compile.ts` builds for it. */
    private encode(node: DensityFunctionNode): number[] {
        switch (node.type) {
            case 'constant':
                return [PointOp.constant, this.constants(f32(node.value))];
            case 'beardifier':
            case 'blend_offset':
                return [PointOp.neutralHook, this.constants(0)];
            case 'blend_alpha':
                return [PointOp.neutralHook, this.constants(1)];
            case 'blend_density':
                return [PointOp.blendDensity, this.node(node.input)];
            case 'cache': {
                const input = this.node(node.input);
                const slot = this.cacheSlots++;
                return [this.source.ignoresY(node.input) ? PointOp.cacheColumn : PointOp.cachePoint, input, slot];
            }
            case 'gradient': {
                const range = node.toCoordinate - node.fromCoordinate;
                const factor = f32(f32(f32(node.toValue) - f32(node.fromValue)) / range);
                return [
                    PointOp.gradient,
                    AXES[node.axis],
                    TILINGS[node.tiling],
                    this.constants(
                        f32(node.fromValue),
                        factor,
                        node.fromCoordinate,
                        Math.min(node.fromCoordinate, node.toCoordinate),
                        Math.max(node.fromCoordinate, node.toCoordinate),
                        range
                    )
                ];
            }
            case 'noise': {
                const stack = this.stack(this.source.noise(node.noise));
                const scales = this.constants(node.xzScale, node.yScale);
                const plain = (shift: DensityFunctionNode): boolean => shift.type === 'constant' && shift.value === 0;
                if (plain(node.shiftX) && plain(node.shiftY) && plain(node.shiftZ)) {
                    return [PointOp.noise, stack, -1, -1, -1, scales];
                }
                const shiftX = this.node(node.shiftX);
                const shiftZ = this.node(node.shiftZ);
                const shiftY = plain(node.shiftY) ? -1 : this.node(node.shiftY);
                return [PointOp.noise, stack, shiftX, shiftY, shiftZ, scales];
            }
            case 'shift':
            case 'shift_a':
            case 'shift_b':
                return [
                    PointOp.shift,
                    this.stack(this.source.noise(node.noise)),
                    { shift: 0, shift_a: 1, shift_b: 2 }[node.type]
                ];
            case 'old_blended_noise': {
                const { stacks, multipliers } = this.source.blendedNoise(node);
                return [
                    PointOp.blended,
                    this.stack(stacks[0]),
                    this.stack(stacks[1]),
                    this.stack(stacks[2]),
                    this.constants(
                        multipliers.xzMultiplier,
                        multipliers.yMultiplier,
                        multipliers.mainXzMultiplier,
                        multipliers.mainYMultiplier
                    )
                ];
            }
            case 'distance_to_point':
                return [PointOp.distance, METRICS[node.metric], this.constants(...node.point)];
            case 'abs':
            case 'cube':
            case 'half_negative':
            case 'negate':
            case 'quarter_negative':
            case 'reciprocal':
            case 'sign':
            case 'sqrt':
            case 'square':
            case 'squeeze':
                return [PointOp.unary, this.node(node.input), UNARY_KINDS.indexOf(node.type)];
            case 'add':
            case 'sub':
            case 'mul':
            case 'div':
            case 'min':
            case 'max':
                return this.binary(node);
            case 'ceil':
            case 'floor':
            case 'round':
            case 'truncate': {
                const input = this.node(node.input);
                const one = node.multiple.type === 'constant' && f32(node.multiple.value) === 1;
                return [PointOp.round, input, ROUNDINGS[node.type], one ? -1 : this.node(node.multiple)];
            }
            case 'clamp':
                return [
                    PointOp.clamp,
                    this.node(node.input),
                    this.constants(f32(node.min)),
                    this.constants(f32(node.max))
                ];
            case 'lerp':
                return [PointOp.lerp, this.node(node.alpha), this.node(node.first), this.node(node.second)];
            case 'range_choice':
                return [
                    PointOp.rangeChoice,
                    this.node(node.input),
                    this.constants(f32(node.minInclusive)),
                    this.constants(f32(node.maxExclusive)),
                    this.node(node.whenInRange),
                    this.node(node.whenOutOfRange)
                ];
            case 'interval_select': {
                const input = this.node(node.input);
                const functions = node.functions.map((entry) => this.node(entry));
                if (functions.length === 0) throw new NotNative();
                const thresholds = this.constants(...node.thresholds.map(f32));
                return [
                    PointOp.intervalSelect,
                    input,
                    thresholds,
                    this.links(functions),
                    functions.length,
                    node.thresholds.length
                ];
            }
            case 'slice':
                return [PointOp.slice, this.node(node.input), AXES[node.axis], this.constants(node.coordinate)];
            case 'find_top_surface':
                return [
                    PointOp.findTopSurface,
                    this.node(node.density),
                    this.node(node.upperBound),
                    this.constants(node.lowerBound, node.cellHeight)
                ];
            case 'pow':
            case 'log':
            case 'end_outer_islands':
            case 'interpolated':
            // Unreached: node() lays a spline node out as its spline's record.
            case 'spline':
                throw new NotNative();
        }
    }

    /** A binary node, in the variant `compile.ts`'s `buildBinary` picks for its constant sides. */
    private binary(node: DensityFunctionNode & { type: 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max' }): number[] {
        const leftConstant = node.left.type === 'constant' ? f32(node.left.value) : undefined;
        const rightConstant = node.right.type === 'constant' ? f32(node.right.value) : undefined;
        const constant = (input: DensityFunctionNode, value: number, kind: number): number[] => [
            PointOp.binaryConstant,
            this.node(input),
            this.constants(value),
            kind
        ];
        const kinds = { add: 0, sub: 1, mul: 2, div: 3, min: 4, max: 5 } as const;
        switch (node.type) {
            case 'add':
            case 'mul':
            case 'min':
            case 'max': {
                const kind = node.type === 'add' ? 0 : node.type === 'mul' ? 2 : node.type === 'min' ? 4 : 5;
                if (leftConstant !== undefined) return constant(node.right, leftConstant, kind);
                if (rightConstant !== undefined) return constant(node.left, rightConstant, kind);
                break;
            }
            case 'sub':
                if (leftConstant !== undefined) return constant(node.right, leftConstant, 1);
                if (rightConstant !== undefined) return constant(node.left, f32(-rightConstant), 0);
                break;
            case 'div':
                if (leftConstant !== undefined) return constant(node.right, leftConstant, 3);
                // Java compiles a constant divisor into a multiply by its reciprocal.
                if (rightConstant !== undefined) return constant(node.left, f32(1 / rightConstant), 2);
                break;
        }
        return [PointOp.binary, this.node(node.left), this.node(node.right), kinds[node.type]];
    }
}
