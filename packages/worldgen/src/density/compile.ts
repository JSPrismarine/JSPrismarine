import { clamp, f32, floor, floorDiv, floorMod, lerpF } from '../math';
import {
    BLENDED_NOISE_SEED,
    blendedNoiseMultipliers,
    createBlendedNoiseFbmSet,
    createBlendedNoiseSampler
} from '../noise/BlendedNoise';
import type { Noise } from '../noise/GradientNoise';
import type { NoiseStack } from '../noise/NoiseStack';
import type { PointProgram, PointProgramHooks } from './pointProgram';
import { encodePointProgram } from './pointProgram';
import { SimplexNoise } from '../noise/SimplexNoise';
import type { RandomSource } from '../random/RandomSource';
import type { CompiledSpline } from './CubicSpline';
import { compileMultipointSpline } from './CubicSpline';
import type { DensityFunctionNode, DistanceMetric, SplineNode } from './DensityFunction';
import { densityInputsOf } from './DensityFunction';
import { cube, square, squeeze } from './arithmetic';
import { CellProgram } from './cellProgram';
import type { SampleContext } from './SampleContext';
import { WorldgenErrors } from '@jsprismarine/errors/worldgen';

/** A compiled density function: one closure that reads a position and the chunk context. */
export type DensitySampler = (context: SampleContext, x: number, y: number, z: number) => number;

type GeneratedEvaluatorFactory = (
    captures: readonly DensitySampler[],
    constants: readonly number[],
    f32Function: typeof f32,
    squareFunction: (value: number) => number,
    cubeFunction: (value: number) => number,
    squeezeFunction: (value: number) => number,
    clampFunction: (value: number, min: number, max: number) => number,
    lerpFunction: (alpha: number, first: number, second: number) => number
) => DensitySampler;

/**
 * The block extent an `interpolated` node holds its eight corners still across.
 *
 * A caller that visits a chunk in blocks of this size keeps one cell current for the whole
 * block, which is what turns eight corner-cache lookups per sample into eight per cell.
 */
export interface InterpolationCellSize {
    /** The cell side across x and across z, in blocks. */
    readonly xz: number;
    /** The cell height, in blocks. */
    readonly y: number;
}

/** A range of density values, both ends included. A range that holds any value has non-finite ends. */
export interface DensityRange {
    lo: number;
    hi: number;
}

/** A box of block positions, both ends of each axis included. */
export interface DensityBox {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
}

/**
 * Writes into `out` a range that holds the value a compiled tree samples at every block inside
 * `box`, for one context. Ends that are not finite mean the tree could not be bounded there, and
 * then a sample may also be NaN.
 */
export type DensityBoundSampler = (context: SampleContext, box: DensityBox, out: DensityRange) => void;

/** The range that holds any value, which is the answer for a node the bound does not model. */
const unbounded: DensityBoundSampler = (_context, _box, out) => {
    out.lo = Number.NEGATIVE_INFINITY;
    out.hi = Number.POSITIVE_INFINITY;
};

/** Whether a range bounds its values. A sample inside a bounded range is a number, never NaN. */
const isBounded = (range: DensityRange): boolean => Number.isFinite(range.lo) && Number.isFinite(range.hi);

/** The greatest common divisor, with `gcd(0, n) === n` so it folds over an empty set. */
const gcd = (a: number, b: number): number => {
    let left = a;
    let right = b;
    while (right !== 0) {
        const remainder = left % right;
        left = right;
        right = remainder;
    }
    return left;
};

const X_AXIS = 1;
const Y_AXIS = 2;
const Z_AXIS = 4;
const XZ_AXES = X_AXIS | Z_AXIS;
const XYZ_AXES = X_AXIS | Y_AXIS | Z_AXIS;

/** What the compiler needs from the world seed to turn a tree into closures. */
export interface CompileEnvironment {
    /** Returns the seeded noise instance for a `worldgen/noise` identifier. */
    noise(id: string): Noise;
    /** Returns the random source keyed by a name, used by `old_blended_noise`. */
    random(id: string): RandomSource;
    /** Returns the legacy random source the outer end islands are seeded from. */
    endIslandRandom(): RandomSource;
    /**
     * Returns an octave stack with the same bits, such as its mirror in the native library. Absent,
     * stacks are sampled as they are.
     */
    stack?(noise: NoiseStack): Noise;
    /**
     * Returns an evaluator with the same bits as a tree's closures, such as the native library
     * running its point program, or undefined to keep the closures. `encode` lays the tree out and
     * answers undefined when it has a node with no native operation.
     */
    pointProgram?(encode: () => PointProgram | undefined): ((x: number, y: number, z: number) => number) | undefined;
    /**
     * Returns a fill with the same bits as a {@link CellProgram} over its records, such as the
     * native library's cell program, or undefined to keep the TypeScript interpreter.
     */
    cellProgram?(records: CellProgramRecords): CellFill | undefined;
}

/** Options for comparing the scalar interpolation path with reusable cell buffers. */
export interface DensityFunctionCompilerOptions {
    /** Whether interpolated nodes fill a reusable typed array for cells up to 4096 blocks. */
    readonly precomputeInterpolationCells?: boolean;
    /** Emits a closed JavaScript evaluator for supported nodes; disabled unless explicitly measured. */
    readonly generatedFunctions?: boolean;
    /** Maximum generated source length before one tree falls back to closures. */
    readonly maximumGeneratedFunctionLength?: number;
}

/**
 * The values of one `interpolated` node over a whole cell, filled in Java's volume order.
 *
 * `values` returns the context's buffer for the node, laid out x-major, then z, then y, and filled
 * for the cell whose minimum corner is given. The buffer is reused for the node's next cell, so
 * read it before asking for another.
 */
export interface InterpolatedCell {
    /** The cell side across x and z, in blocks. */
    readonly xz: number;
    /** The cell height, in blocks. */
    readonly y: number;
    values(context: SampleContext, x0: number, y0: number, z0: number): Float64Array;
    /**
     * Writes the cell's eight corner values into `out` from `at`, in the order {@link values}
     * interpolates them: x, then y, then z varying fastest first.
     */
    corners(context: SampleContext, x0: number, y0: number, z0: number, out: Float64Array, at: number): void;
}

/** Fills a whole cell from its interpolated cells' corners, such as the native cell program. */
export type CellFill = (corners: Float64Array, out: Float64Array) => void;

/** A {@link CellProgram}'s records, as a native interpreter reads them. */
export interface CellProgramRecords {
    readonly nodes: Int32Array;
    readonly constants: Float64Array;
    /** How many `interpolated` cells the records read. */
    readonly cellCount: number;
    readonly xz: number;
    readonly y: number;
}

/** Large datapack interpolation cells stay on the scalar path to avoid large per-context buffers. */
const MAX_INTERPOLATION_BUFFER_VALUES = 4096;

const constantSampler = (value: number): DensitySampler => {
    const narrowed = f32(value);
    return () => narrowed;
};

const isConstant = (node: DensityFunctionNode): node is { type: 'constant'; value: number } => node.type === 'constant';

const roundToInteger = (value: number, type: 'ceil' | 'floor' | 'round' | 'truncate'): number => {
    switch (type) {
        case 'floor':
            return f32(Math.floor(value));
        case 'ceil':
            return f32(Math.ceil(value));
        case 'round':
            // Java's `Math.round(float)` returns the nearest int with ties going up, which is
            // `floor(x + 0.5)` evaluated in double precision rather than in float.
            return f32(Math.floor(value + 0.5));
        case 'truncate':
            return f32(value > 0 ? Math.floor(value) : Math.ceil(value));
    }
};

const distance = (metric: DistanceMetric, dx: number, dy: number, dz: number): number => {
    switch (metric) {
        case 'euclidean':
            return f32(Math.sqrt(f32(f32(square(dx) + square(dy)) + square(dz))));
        case 'euclidean_squared':
            return f32(f32(square(dx) + square(dy)) + square(dz));
        case 'manhattan':
            return f32(f32(Math.abs(dx) + Math.abs(dy)) + Math.abs(dz));
        case 'chebyshev':
            return Math.max(Math.max(Math.abs(dx), Math.abs(dy)), Math.abs(dz));
    }
};

const END_ISLAND_THRESHOLD = -0.9;

const endIslandHeight = (noise: Noise, sectionX: number, sectionZ: number): number => {
    const chunkX = Math.trunc(sectionX / 2);
    const chunkZ = Math.trunc(sectionZ / 2);
    const subSectionX = sectionX % 2;
    const subSectionZ = sectionZ % 2;
    let height = -100;

    for (let xo = -12; xo <= 12; xo++) {
        for (let zo = -12; zo <= 12; zo++) {
            const totalChunkX = chunkX + xo;
            const totalChunkZ = chunkZ + zo;
            if (
                totalChunkX * totalChunkX + totalChunkZ * totalChunkZ > 4096 &&
                noise.get2(totalChunkX, totalChunkZ) < END_ISLAND_THRESHOLD
            ) {
                const islandSize = f32(
                    f32((f32(Math.abs(totalChunkX) * 3439) + f32(Math.abs(totalChunkZ) * 147)) % 13) + 9
                );
                const xd = f32(subSectionX - xo * 2);
                const zd = f32(subSectionZ - zo * 2);
                const candidate = clamp(
                    f32(100 - f32(f32(Math.sqrt(f32(f32(xd * xd) + f32(zd * zd)))) * islandSize)),
                    -100,
                    80
                );
                height = Math.max(height, candidate);
            }
        }
    }
    return height;
};

/**
 * Turns parsed density function trees into closures, once per world seed.
 *
 * One compiler serves every function of one {@link RandomState}: it
 * memoizes by tree identity and hands out the cache slot ids that `cache` nodes share, which
 * is what makes `continents` cost one noise evaluation per position even though the router
 * reaches it through five different slots.
 */
export class DensityFunctionCompiler {
    private readonly compiled = new Map<DensityFunctionNode, DensitySampler>();
    private readonly bounds = new Map<DensityFunctionNode, DensityBoundSampler>();
    private readonly interpolatedCells = new Map<DensityFunctionNode, InterpolatedCell>();
    private readonly densitySamplers = new Map<DensityFunctionNode, DensitySampler>();
    private readonly cellPrograms = new Map<DensityFunctionNode, Map<string, CellProgram>>();
    private readonly cacheIds = new Map<DensityFunctionNode, number>();
    private readonly cellSizes = new Map<DensityFunctionNode, InterpolationCellSize | undefined>();
    private readonly domainAxesByNode = new Map<DensityFunctionNode, number>();
    private nextCacheId = 0;
    private cellSizeXz = 0;
    private cellSizeY = 0;
    private readonly precomputeInterpolationCells: boolean;
    private readonly generatedFunctions: boolean;
    private readonly maximumGeneratedFunctionLength: number;
    private generatedCount = 0;
    private generatedBytes = 0;
    private closureFallbacks = 0;

    public constructor(
        private readonly environment: CompileEnvironment,
        options: DensityFunctionCompilerOptions = {}
    ) {
        this.precomputeInterpolationCells = options.precomputeInterpolationCells ?? true;
        this.generatedFunctions = options.generatedFunctions ?? false;
        this.maximumGeneratedFunctionLength = options.maximumGeneratedFunctionLength ?? 64 * 1024;
    }

    /** How many memo slots the trees compiled so far need. */
    public get cacheCount(): number {
        return this.nextCacheId;
    }

    /** How many sampler functions the optional closed-node code generator emitted. */
    public get generatedFunctionCount(): number {
        return this.generatedCount;
    }

    /** Source characters compiled by the optional code generator; generated source is ASCII. */
    public get generatedFunctionBytes(): number {
        return this.generatedBytes;
    }

    /** How many nodes used the closure compiler because code generation was disabled or unsupported. */
    public get closureFallbackCount(): number {
        return this.closureFallbacks;
    }

    /**
     * The largest block extent that sits inside one cell of every `interpolated` node compiled
     * so far, or undefined while none has been.
     *
     * Vanilla's five overworld nodes all ask for 4 by 8 by 4, so this is that. Taking the
     * greatest common divisor is what makes the answer right for a set of differing sizes: the
     * cells of a node of size `s` are aligned to multiples of `s`, and `gcd | s`, so a block of
     * the divisor's size never straddles two of them.
     *
     * This covers every tree the compiler has seen, so it shrinks when an unrelated tree with a
     * finer cell compiles. The surface pass compiles `chunk_surface_level` with a 16 by 1 cell,
     * and a chunk walked in the gcd of both visits eight times as many cells as final density
     * needs. Use {@link DensityFunctionCompiler.interpolationCellSizeOf} to size a walk.
     */
    public get interpolationCellSize(): InterpolationCellSize | undefined {
        return this.cellSizeXz === 0 || this.cellSizeY === 0 ? undefined : { xz: this.cellSizeXz, y: this.cellSizeY };
    }

    /**
     * The cell shared by the `interpolated` nodes reachable from one tree, or undefined when it
     * holds none.
     *
     * The answer is the same gcd {@link DensityFunctionCompiler.interpolationCellSize} takes,
     * over the nodes this tree can evaluate instead of every node the compiler holds, so it
     * does not depend on which other trees were compiled first. Trees share subtrees, so the
     * walk memoizes by node and visits each once.
     */
    public interpolationCellSizeOf(node: DensityFunctionNode): InterpolationCellSize | undefined {
        if (this.cellSizes.has(node)) return this.cellSizes.get(node);

        let xz = node.type === 'interpolated' ? node.cellSizeXz : 0;
        let y = node.type === 'interpolated' ? node.cellSizeY : 0;
        for (const input of densityInputsOf(node)) {
            const inner = this.interpolationCellSizeOf(input);
            if (inner === undefined) continue;
            xz = gcd(xz, inner.xz);
            y = gcd(y, inner.y);
        }

        const size = xz === 0 || y === 0 ? undefined : { xz, y };
        this.cellSizes.set(node, size);
        return size;
    }

    /** @internal Returns the exact maximum from one reusable interpolation-cell buffer. */
    public interpolatedCellMaximum(
        node: DensityFunctionNode,
        context: SampleContext,
        x: number,
        y: number,
        z: number
    ): number | undefined {
        if (node.type !== 'interpolated' || !this.precomputeInterpolationCells) return undefined;

        const cellSizeXz = node.cellSizeXz;
        const cellSizeY = node.cellSizeY;
        const valueCount = cellSizeXz * cellSizeY * cellSizeXz;
        if (cellSizeXz <= 0 || cellSizeY <= 0 || valueCount > MAX_INTERPOLATION_BUFFER_VALUES) return undefined;

        const cellX = floorDiv(x, cellSizeXz) * cellSizeXz;
        const cellY = floorDiv(y, cellSizeY) * cellSizeY;
        const cellZ = floorDiv(z, cellSizeXz) * cellSizeXz;
        if (cellSizeXz === 1 && cellSizeY === 1) return undefined;

        // The interpolation closure returns a lattice corner before it considers its cell buffer.
        // Sample one interior point to make it fill the reusable buffer the chunk walker uses.
        const sampleX = cellX + (cellSizeXz > 1 ? 1 : 0);
        const sampleY = cellY + (cellSizeXz === 1 && cellSizeY > 1 ? 1 : 0);
        const sampler = this.compile(node);
        const bufferingBeforeSample = context.interpolationBuffersEnabled;
        context.interpolationBuffersEnabled = true;
        try {
            sampler(context, sampleX, sampleY, cellZ);
        } finally {
            context.interpolationBuffersEnabled = bufferingBeforeSample;
        }

        const id = this.cacheId(node);
        if (context.interpolationBufferValue(id, cellX, cellY, cellZ, 0) === undefined) return undefined;

        let maximum = Number.NEGATIVE_INFINITY;
        for (const value of context.interpolationBuffer(id, valueCount)) maximum = Math.max(maximum, value);
        return maximum;
    }

    /**
     * The whole-cell values of an `interpolated` node, or undefined when the node is not
     * `interpolated` or its cells are too large to buffer.
     */
    public interpolatedCell(node: DensityFunctionNode): InterpolatedCell | undefined {
        if (node.type !== 'interpolated') return undefined;
        this.compile(node);
        return this.interpolatedCells.get(node);
    }

    /**
     * Compiles a tree into a program that evaluates it over a whole cell at a time; see
     * {@link CellProgram}. Programs are kept per tree and cell size.
     */
    public cellProgram(node: DensityFunctionNode, cell: InterpolationCellSize): CellProgram {
        const key = `${cell.xz}x${cell.y}`;
        let byCell = this.cellPrograms.get(node);
        if (byCell === undefined) {
            byCell = new Map();
            this.cellPrograms.set(node, byCell);
        }
        let program = byCell.get(key);
        if (program === undefined) {
            program = new CellProgram(node, cell, {
                sampler: (input) => this.compile(input),
                interpolatedCell: (input) => this.interpolatedCell(input),
                ...(this.environment.cellProgram === undefined
                    ? {}
                    : { nativeFill: (records: CellProgramRecords) => this.environment.cellProgram?.(records) })
            });
            byCell.set(key, program);
        }
        return program;
    }

    /**
     * Compiles a tree, reusing the closure when the same tree was compiled before.
     *
     * @throws When the tree contains a node type the compiler does not know, which only
     *   happens if a parser and this switch drift apart.
     */
    public compile(node: DensityFunctionNode): DensitySampler {
        const existing = this.compiled.get(node);
        if (existing) return existing;
        const generated = this.generatedFunctions ? this.buildGenerated(node) : undefined;
        if (generated === undefined) this.closureFallbacks++;
        const sampler = generated ?? this.build(node);
        this.compiled.set(node, sampler);
        return sampler;
    }

    /**
     * Compiles a tree into a function that bounds its samples over a box of blocks.
     *
     * The bound is conservative: every sample the compiled tree returns inside the box lies in
     * the range, and a node it does not model makes the range unbounded. An `interpolated`
     * node's value is a chain of single-precision lerps between the eight corners of its cell,
     * and each lerp stays between its two ends, so the corners bound every value in the cell.
     * That holds only for a box inside one cell of every `interpolated` node in the tree; size
     * the box with {@link DensityFunctionCompiler.interpolationCellSizeOf} and align it to that
     * size. A box that crosses a cell edge gets an unbounded range.
     *
     * Bounding a box computes the corners its `interpolated` nodes read, through the same
     * corner cache the samplers use, so a later sample in the box reuses them.
     */
    public boundSampler(node: DensityFunctionNode): DensityBoundSampler {
        const existing = this.bounds.get(node);
        if (existing) return existing;
        const sampler = this.buildBound(node);
        this.bounds.set(node, sampler);
        return sampler;
    }

    /** Builds an evaluator from a closed set of AST kinds, leaving stateful nodes as captures. */
    private buildGenerated(node: DensityFunctionNode): DensitySampler | undefined {
        const captures: DensitySampler[] = [];
        const constants: number[] = [];
        const constant = (value: number, narrowToFloat = true): string => {
            const index = constants.push(narrowToFloat ? f32(value) : value) - 1;
            return `constants[${index}]`;
        };
        const child = (entry: DensityFunctionNode, x = 'x', y = 'y', z = 'z'): string => {
            const inline = this.generatedExpression(entry, child, constant, x, y, z);
            if (inline !== undefined) return inline;
            const index = captures.push(this.compile(entry)) - 1;
            return `captures[${index}](context, ${x}, ${y}, ${z})`;
        };

        const expression = this.generatedExpression(node, child, constant, 'x', 'y', 'z');
        if (expression === undefined) return undefined;
        const source = `return (context, x, y, z) => ${expression};`;
        if (source.length > this.maximumGeneratedFunctionLength) return undefined;

        try {
            // Only compiler-authored expressions and indexed constants enter this constructor; pack strings never become source.
            // TypeScript cannot infer the fixed factory signature returned by `new Function`.
            const factory = new Function(
                'captures',
                'constants',
                'f32',
                'square',
                'cube',
                'squeeze',
                'clamp',
                'lerpF',
                source
            ) as GeneratedEvaluatorFactory;
            const generated = factory(captures, constants, f32, square, cube, squeeze, clamp, lerpF);
            this.generatedCount++;
            this.generatedBytes += source.length;
            return generated;
        } catch (error) {
            // Hosts that forbid dynamic code generation can still use the equivalent closure path.
            if (error instanceof EvalError) return undefined;
            throw error;
        }
    }

    /** Emits expressions for pure arithmetic and delegates stateful or uncommon nodes to closures. */
    private generatedExpression(
        node: DensityFunctionNode,
        child: (node: DensityFunctionNode, x?: string, y?: string, z?: string) => string,
        constant: (value: number, narrowToFloat?: boolean) => string,
        x: string,
        y: string,
        z: string
    ): string | undefined {
        switch (node.type) {
            case 'constant':
                return constant(node.value);
            case 'abs':
                return `Math.abs(${child(node.input, x, y, z)})`;
            case 'square':
                return `square(${child(node.input, x, y, z)})`;
            case 'cube':
                return `cube(${child(node.input, x, y, z)})`;
            case 'sqrt':
                return `f32(Math.sqrt(${child(node.input, x, y, z)}))`;
            case 'half_negative':
                return `((value) => value > 0 ? value : f32(value * 0.5))(${child(node.input, x, y, z)})`;
            case 'quarter_negative':
                return `((value) => value > 0 ? value : f32(value * 0.25))(${child(node.input, x, y, z)})`;
            case 'reciprocal':
                return `f32(1 / ${child(node.input, x, y, z)})`;
            case 'negate':
                return `-${child(node.input, x, y, z)}`;
            case 'squeeze':
                return `squeeze(${child(node.input, x, y, z)})`;
            case 'log':
                return `f32(Math.log(${child(node.input, x, y, z)}))`;
            case 'sign':
                return `Math.sign(${child(node.input, x, y, z)})`;
            case 'add': {
                const left = child(node.left, x, y, z);
                const right = child(node.right, x, y, z);
                return `f32(${left} + ${right})`;
            }
            case 'sub': {
                const leftConstant = isConstant(node.left) ? f32(node.left.value) : undefined;
                const rightConstant = isConstant(node.right) ? f32(node.right.value) : undefined;
                if (leftConstant !== undefined) {
                    return `f32(${constant(leftConstant)} - ${child(node.right, x, y, z)})`;
                }
                if (rightConstant !== undefined) {
                    return `f32(${child(node.left, x, y, z)} + ${constant(f32(-rightConstant))})`;
                }
                return `f32(${child(node.left, x, y, z)} - ${child(node.right, x, y, z)})`;
            }
            case 'mul': {
                const leftConstant = isConstant(node.left) ? f32(node.left.value) : undefined;
                const rightConstant = isConstant(node.right) ? f32(node.right.value) : undefined;
                if (leftConstant !== undefined) {
                    return `f32(${child(node.right, x, y, z)} * ${constant(leftConstant)})`;
                }
                if (rightConstant !== undefined) {
                    return `f32(${child(node.left, x, y, z)} * ${constant(rightConstant)})`;
                }
                return `((left) => left === 0 ? 0 : f32(left * ${child(node.right, x, y, z)}))(${child(node.left, x, y, z)})`;
            }
            case 'div': {
                const leftConstant = isConstant(node.left) ? f32(node.left.value) : undefined;
                const rightConstant = isConstant(node.right) ? f32(node.right.value) : undefined;
                if (leftConstant !== undefined) {
                    return `f32(${constant(leftConstant)} / ${child(node.right, x, y, z)})`;
                }
                if (rightConstant !== undefined) {
                    return `f32(${child(node.left, x, y, z)} * ${constant(f32(1 / rightConstant))})`;
                }
                return `((left) => left === 0 ? 0 : f32(left / ${child(node.right, x, y, z)}))(${child(node.left, x, y, z)})`;
            }
            case 'min':
                return `Math.min(${child(node.left, x, y, z)}, ${child(node.right, x, y, z)})`;
            case 'max':
                return `Math.max(${child(node.left, x, y, z)}, ${child(node.right, x, y, z)})`;
            case 'clamp':
                return `clamp(${child(node.input, x, y, z)}, ${constant(node.min)}, ${constant(node.max)})`;
            case 'lerp': {
                const first = child(node.first, x, y, z);
                const second = child(node.second, x, y, z);
                return `((weight) => weight === 0 ? ${first} : weight === 1 ? ${second} : lerpF(weight, ${first}, ${second}))(${child(node.alpha, x, y, z)})`;
            }
            case 'range_choice':
                return `((value) => value >= ${constant(node.minInclusive)} && value < ${constant(node.maxExclusive)} ? ${child(node.whenInRange, x, y, z)} : ${child(node.whenOutOfRange, x, y, z)})(${child(node.input, x, y, z)})`;
            case 'slice': {
                // Slice coordinates are block positions, not density values. Preserve adjacent
                // integers above 2^24 instead of rounding them through the Float32 table.
                const fixed = constant(node.coordinate, false);
                switch (node.axis) {
                    case 'x':
                        return child(node.input, fixed, y, z);
                    case 'y':
                        return child(node.input, x, fixed, z);
                    case 'z':
                        return child(node.input, x, y, fixed);
                }
            }
            default:
                return undefined;
        }
    }

    /** Whether every operation in a tree is independent of its y coordinate. */
    public isYIndependent(node: DensityFunctionNode): boolean {
        return (this.domainAxes(node) & Y_AXIS) === 0;
    }

    private build(node: DensityFunctionNode): DensitySampler {
        switch (node.type) {
            case 'constant':
                return constantSampler(node.value);

            case 'blend_alpha':
                return (context, x, y, z) => (context.blendAlpha ? context.blendAlpha(context, x, y, z) : 1);
            case 'blend_offset':
                return (context, x, y, z) => (context.blendOffset ? context.blendOffset(context, x, y, z) : 0);
            case 'beardifier':
                return (context, x, y, z) => (context.beardifier ? context.beardifier(context, x, y, z) : 0);
            case 'blend_density': {
                const input = this.compile(node.input);
                return (context, x, y, z) => {
                    const value = input(context, x, y, z);
                    return context.blendDensity ? context.blendDensity(x, y, z, value) : value;
                };
            }

            case 'cache': {
                const id = this.cacheId(node);
                const input = this.compile(node.input);
                if ((this.domainAxes(node.input) & Y_AXIS) === 0) {
                    return (context, x, _y, z) => context.cell(id).getColumnValue(context, input, x, z);
                }
                return (context, x, y, z) => {
                    const cell = context.cell(id);
                    if (cell.valid && cell.x === x && cell.y === y && cell.z === z) return cell.value;
                    const value = input(context, x, y, z);
                    cell.x = x;
                    cell.y = y;
                    cell.z = z;
                    cell.value = value;
                    cell.valid = true;
                    return value;
                };
            }

            case 'gradient':
                return this.buildGradient(node);
            case 'noise':
                return this.buildNoise(node);
            case 'shift': {
                const noise = this.environment.noise(node.noise);
                return (_context, x, y, z) => f32(noise.get3(x * 0.25, y * 0.25, z * 0.25) * 4);
            }
            case 'shift_a': {
                const noise = this.environment.noise(node.noise);
                return (_context, x, _y, z) => f32(noise.get3(x * 0.25, 0, z * 0.25) * 4);
            }
            case 'shift_b': {
                const noise = this.environment.noise(node.noise);
                return (_context, x, _y, z) => f32(noise.get3(z * 0.25, x * 0.25, 0) * 4);
            }
            case 'old_blended_noise': {
                const environment = this.environment;
                const sample = createBlendedNoiseSampler(
                    environment.random(BLENDED_NOISE_SEED),
                    node,
                    (noise) => environment.stack?.(noise) ?? noise
                );
                return (_context, x, y, z) => sample(x, y, z);
            }
            case 'end_outer_islands': {
                const random = this.environment.endIslandRandom();
                random.consumeCount(17292);
                const noise = new SimplexNoise(random, true);
                return (_context, x, _y, z) =>
                    f32(f32(endIslandHeight(noise, Math.trunc(x / 8), Math.trunc(z / 8)) - 8) / 128);
            }
            case 'distance_to_point': {
                const [px, py, pz] = node.point;
                const metric = node.metric;
                return (_context, x, y, z) => distance(metric, px - x, py - y, pz - z);
            }

            case 'abs':
            case 'cube':
            case 'half_negative':
            case 'log':
            case 'negate':
            case 'quarter_negative':
            case 'reciprocal':
            case 'sign':
            case 'sqrt':
            case 'square':
            case 'squeeze':
                return this.buildUnary(node.type, this.compile(node.input));

            case 'add':
            case 'div':
            case 'max':
            case 'min':
            case 'mul':
            case 'sub':
                return this.buildBinary(node);

            case 'ceil':
            case 'floor':
            case 'round':
            case 'truncate': {
                const type = node.type;
                const input = this.compile(node.input);
                if (isConstant(node.multiple) && f32(node.multiple.value) === 1) {
                    return (context, x, y, z) => roundToInteger(input(context, x, y, z), type);
                }
                const multiple = this.compile(node.multiple);
                return (context, x, y, z) => {
                    const value = input(context, x, y, z);
                    const step = multiple(context, x, y, z);
                    return step === 0 ? value : f32(roundToInteger(f32(value / step), type) * step);
                };
            }

            case 'clamp': {
                const input = this.compile(node.input);
                const min = f32(node.min);
                const max = f32(node.max);
                return (context, x, y, z) => clamp(input(context, x, y, z), min, max);
            }

            case 'pow':
                return this.buildPow(node);

            case 'lerp': {
                const alpha = this.compile(node.alpha);
                const first = this.compile(node.first);
                const second = this.compile(node.second);
                return (context, x, y, z) => {
                    const weight = alpha(context, x, y, z);
                    if (weight === 0) return first(context, x, y, z);
                    if (weight === 1) return second(context, x, y, z);
                    return lerpF(weight, first(context, x, y, z), second(context, x, y, z));
                };
            }

            case 'range_choice': {
                const input = this.compile(node.input);
                const whenInRange = this.compile(node.whenInRange);
                const whenOutOfRange = this.compile(node.whenOutOfRange);
                const min = f32(node.minInclusive);
                const max = f32(node.maxExclusive);
                return (context, x, y, z) => {
                    const value = input(context, x, y, z);
                    return value >= min && value < max
                        ? whenInRange(context, x, y, z)
                        : whenOutOfRange(context, x, y, z);
                };
            }

            case 'interval_select': {
                const input = this.compile(node.input);
                const thresholds = Float32Array.from(node.thresholds);
                const samplers = node.functions.map((entry) => this.compile(entry));
                const lastSampler = samplers[samplers.length - 1];
                if (!lastSampler) throw new WorldgenErrors.EmptyIntervalSelect();
                return (context, x, y, z) => {
                    const value = input(context, x, y, z);
                    for (let i = 0; i < thresholds.length; i++) {
                        if (value < (thresholds[i] ?? 0)) return (samplers[i] ?? lastSampler)(context, x, y, z);
                    }
                    return lastSampler(context, x, y, z);
                };
            }

            case 'slice': {
                const input = this.compile(node.input);
                const fixed = node.coordinate;
                switch (node.axis) {
                    case 'x':
                        return (context, _x, y, z) => input(context, fixed, y, z);
                    case 'y':
                        return (context, x, _y, z) => input(context, x, fixed, z);
                    case 'z':
                        return (context, x, y) => input(context, x, y, fixed);
                }
                break;
            }

            case 'interpolated': {
                const id = this.cacheId(node);
                const input = this.withNativeProgram(node.input, this.compile(node.input));
                const cellSizeXz = node.cellSizeXz;
                const cellSizeY = node.cellSizeY;
                this.cellSizeXz = gcd(this.cellSizeXz, cellSizeXz);
                this.cellSizeY = gcd(this.cellSizeY, cellSizeY);
                // Positions are integers (Java samples at block positions), so a power-of-two
                // cell size turns the floored modulus into a mask and the lattice index into an
                // arithmetic shift. Vanilla sizes are 4 to 16.
                const powerOfTwoXz = (cellSizeXz & (cellSizeXz - 1)) === 0;
                const powerOfTwoY = (cellSizeY & (cellSizeY - 1)) === 0;
                const maskXz = powerOfTwoXz ? cellSizeXz - 1 : 0;
                const maskY = powerOfTwoY ? cellSizeY - 1 : 0;
                const shiftXz = powerOfTwoXz ? Math.log2(cellSizeXz) : 0;
                const shiftY = powerOfTwoY ? Math.log2(cellSizeY) : 0;
                // The interpolation weight only ever takes `cellSize` values, and dividing by
                // the cell size is exact for a power of two, so the table holds the same bits
                // the division produced.
                const alphaXz = Float64Array.from({ length: cellSizeXz }, (_, step) => f32(step / cellSizeXz));
                const alphaY = Float64Array.from({ length: cellSizeY }, (_, step) => f32(step / cellSizeY));
                const sampleAt: DensitySampler = (context, x, y, z) => {
                    const xInCell = powerOfTwoXz ? x & maskXz : floorMod(x, cellSizeXz);
                    const yInCell = powerOfTwoY ? y & maskY : floorMod(y, cellSizeY);
                    const zInCell = powerOfTwoXz ? z & maskXz : floorMod(z, cellSizeXz);
                    const x0 = x - xInCell;
                    const y0 = y - yInCell;
                    const z0 = z - zInCell;
                    // The corner cache indexes the lattice, so it wants cell indices. They are
                    // exact: x0 is x floored to a multiple of the cell size.
                    const cellX = powerOfTwoXz ? x >> shiftXz : x0 / cellSizeXz;
                    const cellY = powerOfTwoY ? y >> shiftY : y0 / cellSizeY;
                    const cellZ = powerOfTwoXz ? z >> shiftXz : z0 / cellSizeXz;
                    if (xInCell === 0 && yInCell === 0 && zInCell === 0) {
                        return context.cornerCache(id).getOrCompute(context, input, cellX, cellY, cellZ, x0, y0, z0);
                    }

                    const base = id << 3;
                    if (!context.interpolationCell(id, x0, y0, z0)) {
                        const corners = context.interpolationCorners;
                        const cache = context.cornerCache(id);
                        const x1 = x0 + cellSizeXz;
                        const y1 = y0 + cellSizeY;
                        const z1 = z0 + cellSizeXz;
                        const cellX1 = cellX + 1;
                        const cellY1 = cellY + 1;
                        const cellZ1 = cellZ + 1;
                        corners[base] = cache.getOrCompute(context, input, cellX, cellY, cellZ, x0, y0, z0);
                        corners[base + 1] = cache.getOrCompute(context, input, cellX1, cellY, cellZ, x1, y0, z0);
                        corners[base + 2] = cache.getOrCompute(context, input, cellX, cellY1, cellZ, x0, y1, z0);
                        corners[base + 3] = cache.getOrCompute(context, input, cellX1, cellY1, cellZ, x1, y1, z0);
                        corners[base + 4] = cache.getOrCompute(context, input, cellX, cellY, cellZ1, x0, y0, z1);
                        corners[base + 5] = cache.getOrCompute(context, input, cellX1, cellY, cellZ1, x1, y0, z1);
                        corners[base + 6] = cache.getOrCompute(context, input, cellX, cellY1, cellZ1, x0, y1, z1);
                        corners[base + 7] = cache.getOrCompute(context, input, cellX1, cellY1, cellZ1, x1, y1, z1);
                    }

                    // `lerp3F` spelled out because V8 does not inline it here. Reuse its four
                    // x-stage values across samples at the same x offset; y and z remain per
                    // sample. Exact `lerp3F` parity is checked in density.test.ts.
                    const corners = context.interpolationCorners;
                    const horizontal = context.interpolationXCache;
                    const horizontalBase = id * 5;
                    let p0: number;
                    let p1: number;
                    let p2: number;
                    let p3: number;
                    if (horizontal[horizontalBase] === xInCell) {
                        p0 = horizontal[horizontalBase + 1] ?? 0;
                        p1 = horizontal[horizontalBase + 2] ?? 0;
                        p2 = horizontal[horizontalBase + 3] ?? 0;
                        p3 = horizontal[horizontalBase + 4] ?? 0;
                    } else {
                        const alphaX = alphaXz[xInCell] ?? 0;
                        const c0 = corners[base] ?? 0;
                        const c1 = corners[base + 1] ?? 0;
                        const c2 = corners[base + 2] ?? 0;
                        const c3 = corners[base + 3] ?? 0;
                        const c4 = corners[base + 4] ?? 0;
                        const c5 = corners[base + 5] ?? 0;
                        const c6 = corners[base + 6] ?? 0;
                        const c7 = corners[base + 7] ?? 0;
                        p0 = f32(c0 + f32(alphaX * f32(c1 - c0)));
                        p1 = f32(c2 + f32(alphaX * f32(c3 - c2)));
                        p2 = f32(c4 + f32(alphaX * f32(c5 - c4)));
                        p3 = f32(c6 + f32(alphaX * f32(c7 - c6)));
                        horizontal[horizontalBase] = xInCell;
                        horizontal[horizontalBase + 1] = p0;
                        horizontal[horizontalBase + 2] = p1;
                        horizontal[horizontalBase + 3] = p2;
                        horizontal[horizontalBase + 4] = p3;
                    }
                    const vertical = context.interpolationYCache;
                    const verticalBase = id * 80 + (yInCell & 15) * 5;
                    const version = context.interpolationCellVersions[id] ?? 0;
                    let q0: number;
                    let q1: number;
                    if (
                        vertical[verticalBase] === version &&
                        vertical[verticalBase + 1] === xInCell &&
                        vertical[verticalBase + 2] === yInCell
                    ) {
                        q0 = vertical[verticalBase + 3] ?? 0;
                        q1 = vertical[verticalBase + 4] ?? 0;
                    } else {
                        const weightY = alphaY[yInCell] ?? 0;
                        q0 = f32(p0 + f32(weightY * f32(p1 - p0)));
                        q1 = f32(p2 + f32(weightY * f32(p3 - p2)));
                        vertical[verticalBase] = version;
                        vertical[verticalBase + 1] = xInCell;
                        vertical[verticalBase + 2] = yInCell;
                        vertical[verticalBase + 3] = q0;
                        vertical[verticalBase + 4] = q1;
                    }
                    const alphaZ = alphaXz[zInCell] ?? 0;
                    return f32(q0 + f32(alphaZ * f32(q1 - q0)));
                };

                const bufferValueCount = cellSizeXz * cellSizeY * cellSizeXz;
                // Java's volume path weights by `i * (1f / size)` rather than `i / size`; the two
                // agree for the power-of-two sizes vanilla uses and can differ for others.
                const inverseCellSizeXz = f32(1 / cellSizeXz);
                const inverseCellSizeY = f32(1 / cellSizeY);
                const volumeAlphaXz = Float64Array.from({ length: cellSizeXz }, (_, step) =>
                    f32(step * inverseCellSizeXz)
                );
                if (!this.precomputeInterpolationCells || bufferValueCount > MAX_INTERPOLATION_BUFFER_VALUES) {
                    return sampleAt;
                }

                // The corners of one cell, from the context's corner cache; a cell's corners are shared
                // with its neighbors, so each lattice point is computed once per chunk.
                const loadCorners = (context: SampleContext, cellX: number, cellY: number, cellZ: number): void => {
                    const x0 = cellX * cellSizeXz;
                    const y0 = cellY * cellSizeY;
                    const z0 = cellZ * cellSizeXz;
                    const x1 = x0 + cellSizeXz;
                    const y1 = y0 + cellSizeY;
                    const z1 = z0 + cellSizeXz;
                    if (!context.interpolationCell(id, x0, y0, z0)) {
                        const base = id << 3;
                        const corners = context.interpolationCorners;
                        const cache = context.cornerCache(id);
                        const cellX1 = cellX + 1;
                        const cellY1 = cellY + 1;
                        const cellZ1 = cellZ + 1;
                        corners[base] = cache.getOrCompute(context, input, cellX, cellY, cellZ, x0, y0, z0);
                        corners[base + 1] = cache.getOrCompute(context, input, cellX1, cellY, cellZ, x1, y0, z0);
                        corners[base + 2] = cache.getOrCompute(context, input, cellX, cellY1, cellZ, x0, y1, z0);
                        corners[base + 3] = cache.getOrCompute(context, input, cellX1, cellY1, cellZ, x1, y1, z0);
                        corners[base + 4] = cache.getOrCompute(context, input, cellX, cellY, cellZ1, x0, y0, z1);
                        corners[base + 5] = cache.getOrCompute(context, input, cellX1, cellY, cellZ1, x1, y0, z1);
                        corners[base + 6] = cache.getOrCompute(context, input, cellX, cellY1, cellZ1, x0, y1, z1);
                        corners[base + 7] = cache.getOrCompute(context, input, cellX1, cellY1, cellZ1, x1, y1, z1);
                    }
                };

                const fillCell = (
                    context: SampleContext,
                    cellX: number,
                    cellY: number,
                    cellZ: number,
                    output: Float64Array
                ): void => {
                    loadCorners(context, cellX, cellY, cellZ);

                    // Java's `InterpolatedFunction$Sampler.fillCell`, the order `doFill` builds terrain in:
                    // the four z edges first, then x, then y as a running sum of one step per block.
                    // Its per-block `sampleValue` interpolates x, then y, then z, which `sampleAt`
                    // keeps; the two differ in the last bits, and terrain follows this one.
                    const base = id << 3;
                    const corners = context.interpolationCorners;
                    const c000 = corners[base] ?? 0;
                    const c100 = corners[base + 1] ?? 0;
                    const c010 = corners[base + 2] ?? 0;
                    const c110 = corners[base + 3] ?? 0;
                    const c001 = corners[base + 4] ?? 0;
                    const c101 = corners[base + 5] ?? 0;
                    const c011 = corners[base + 6] ?? 0;
                    const c111 = corners[base + 7] ?? 0;
                    for (let localZ = 0; localZ < cellSizeXz; localZ++) {
                        const alphaZ = volumeAlphaXz[localZ] ?? 0;
                        const e00 = f32(c000 + f32(alphaZ * f32(c001 - c000)));
                        const e01 = f32(c100 + f32(alphaZ * f32(c101 - c100)));
                        const e10 = f32(c010 + f32(alphaZ * f32(c011 - c010)));
                        const e11 = f32(c110 + f32(alphaZ * f32(c111 - c110)));
                        for (let localX = 0; localX < cellSizeXz; localX++) {
                            const alphaX = volumeAlphaXz[localX] ?? 0;
                            const low = f32(e00 + f32(alphaX * f32(e01 - e00)));
                            const high = f32(e10 + f32(alphaX * f32(e11 - e10)));
                            const step = f32(f32(high - low) * inverseCellSizeY);
                            // Java starts the sum at `low + step * startY`; a cell's first block has
                            // startY 0, and the addition is kept because it turns a -0 into +0.
                            let value = f32(low + f32(step * 0));
                            const outputBase = (localX * cellSizeXz + localZ) * cellSizeY;
                            for (let localY = 0; localY < cellSizeY; localY++) {
                                output[outputBase + localY] = value;
                                value = f32(value + step);
                            }
                        }
                    }
                };

                const cellValues = (context: SampleContext, x0: number, y0: number, z0: number): Float64Array => {
                    const filled = context.filledInterpolationBuffer(id, x0, y0, z0);
                    if (filled !== undefined) return filled;
                    const output = context.interpolationBuffer(id, bufferValueCount);
                    fillCell(context, x0 / cellSizeXz, y0 / cellSizeY, z0 / cellSizeXz, output);
                    context.markInterpolationBufferFilled(id, x0, y0, z0);
                    return output;
                };
                const cellCorners = (
                    context: SampleContext,
                    x0: number,
                    y0: number,
                    z0: number,
                    out: Float64Array,
                    at: number
                ): void => {
                    loadCorners(context, x0 / cellSizeXz, y0 / cellSizeY, z0 / cellSizeXz);
                    const base = id << 3;
                    for (let corner = 0; corner < 8; corner++)
                        out[at + corner] = context.interpolationCorners[base + corner]!;
                };
                this.interpolatedCells.set(node, {
                    xz: cellSizeXz,
                    y: cellSizeY,
                    values: cellValues,
                    corners: cellCorners
                });

                return (context, x, y, z) => {
                    if (!context.interpolationBuffersEnabled) return sampleAt(context, x, y, z);

                    const xInCell = powerOfTwoXz ? x & maskXz : floorMod(x, cellSizeXz);
                    const yInCell = powerOfTwoY ? y & maskY : floorMod(y, cellSizeY);
                    const zInCell = powerOfTwoXz ? z & maskXz : floorMod(z, cellSizeXz);
                    const x0 = x - xInCell;
                    const y0 = y - yInCell;
                    const z0 = z - zInCell;
                    // Match fillCell's x-major, z-middle, y-minor typed-array layout.
                    const outputIndex = (xInCell * cellSizeXz + zInCell) * cellSizeY + yInCell;
                    const cached = context.interpolationBufferValue(id, x0, y0, z0, outputIndex);
                    if (cached !== undefined) return cached;
                    return cellValues(context, x0, y0, z0)[outputIndex] ?? 0;
                };
            }

            case 'find_top_surface': {
                const density = this.compile(node.density);
                const upperBound = this.compile(node.upperBound);
                const lowerBound = node.lowerBound;
                const cellHeight = node.cellHeight;
                return (context, x, _y, z) => {
                    const top = floor(upperBound(context, x, 0, z) / cellHeight) * cellHeight;
                    if (top <= lowerBound) return lowerBound;
                    for (let probeY = top; probeY >= lowerBound; probeY -= cellHeight) {
                        if (density(context, x, probeY, z) > 0) return probeY;
                    }
                    return lowerBound;
                };
            }

            case 'spline': {
                const spline = this.compileSpline(node.spline);
                return (context, x, y, z) => spline(context, x, y, z);
            }
        }

        throw new WorldgenErrors.UncompilableDensityFunction({ node: JSON.stringify(node) });
    }

    /**
     * A tree's point program, run by the environment, with the same bits as its closures; or
     * undefined when the environment runs none or the tree has a node with no native operation.
     * The evaluator ignores structure and blending hooks, so call it only where none is set.
     */
    public nativeSampler(node: DensityFunctionNode): ((x: number, y: number, z: number) => number) | undefined {
        return this.nativeProgram(node)?.evaluate;
    }

    /** A tree's point program in the environment and the hooks it reaches, or undefined. */
    private nativeProgram(
        node: DensityFunctionNode
    ): { evaluate: (x: number, y: number, z: number) => number; hooks: PointProgramHooks } | undefined {
        const environment = this.environment;
        let encoded: PointProgram | undefined;
        const evaluate = environment.pointProgram?.(() => {
            encoded = encodePointProgram(node, {
                noise: (id) => environment.noise(id),
                blendedNoise: (blended) => {
                    const fbm = createBlendedNoiseFbmSet(environment.random(BLENDED_NOISE_SEED), blended);
                    const stack = (noise: NoiseStack): Noise => environment.stack?.(noise) ?? noise;
                    return {
                        stacks: [stack(fbm.minLimitNoise), stack(fbm.maxLimitNoise), stack(fbm.mainNoise)],
                        multipliers: blendedNoiseMultipliers(blended)
                    };
                },
                ignoresY: (input) => (this.domainAxes(input) & Y_AXIS) === 0
            });
            return encoded;
        });
        return evaluate === undefined || encoded === undefined ? undefined : { evaluate, hooks: encoded.hooks };
    }

    /**
     * A tree's fastest sampler with its closures' bits: its point program in the environment when
     * one runs, else its closure. A context with a structure or blending hook set takes the
     * closure, since those hooks live in TypeScript. Built once per tree.
     */
    public densitySampler(node: DensityFunctionNode): DensitySampler {
        const existing = this.densitySamplers.get(node);
        if (existing !== undefined) return existing;
        const created = this.withNativeProgram(node, this.compile(node));
        this.densitySamplers.set(node, created);
        return created;
    }

    /**
     * A closure that hands each sample to the tree's point program where one runs, unless the
     * context sets a hook the tree reaches. The program answers its hooks neutrally, and a hook the
     * tree never reaches, such as a structure's beard outside the trees under `interpolated`, does
     * not change its value.
     */
    private withNativeProgram(node: DensityFunctionNode, closure: DensitySampler): DensitySampler {
        const program = this.nativeProgram(node);
        if (program === undefined) return closure;
        const { evaluate, hooks } = program;
        if (!hooks.beardifier && !hooks.blendAlpha && !hooks.blendOffset && !hooks.blendDensity) {
            return (_context, x, y, z) => evaluate(x, y, z);
        }
        return (context, x, y, z) =>
            (hooks.beardifier && context.beardifier !== undefined) ||
            (hooks.blendAlpha && context.blendAlpha !== undefined) ||
            (hooks.blendOffset && context.blendOffset !== undefined) ||
            (hooks.blendDensity && context.blendDensity !== undefined)
                ? closure(context, x, y, z)
                : evaluate(x, y, z);
    }

    private cacheId(node: DensityFunctionNode): number {
        const existing = this.cacheIds.get(node);
        if (existing !== undefined) return existing;
        const id = this.nextCacheId++;
        this.cacheIds.set(node, id);
        return id;
    }

    /**
     * Which input coordinates can change a node's result. Unknown or context-backed behavior
     * stays three-dimensional so a cache is never widened beyond what its function proves.
     */
    private domainAxes(node: DensityFunctionNode): number {
        const cached = this.domainAxesByNode.get(node);
        if (cached !== undefined) return cached;

        let axes = XYZ_AXES;
        switch (node.type) {
            case 'constant':
                axes = 0;
                break;
            case 'blend_alpha':
            case 'blend_offset':
                // Java's blender supplies horizontal values; SampleContext documents this contract.
                axes = XZ_AXES;
                break;
            case 'beardifier':
            case 'blend_density':
            case 'distance_to_point':
            case 'old_blended_noise':
            case 'shift':
                axes = XYZ_AXES;
                break;
            case 'end_outer_islands':
            case 'shift_a':
            case 'shift_b':
                axes = XZ_AXES;
                break;
            case 'gradient':
                axes = node.axis === 'x' ? X_AXIS : node.axis === 'y' ? Y_AXIS : Z_AXIS;
                break;
            case 'noise':
                axes =
                    (node.xzScale === 0 ? 0 : XZ_AXES) |
                    (node.yScale === 0 ? 0 : Y_AXIS) |
                    this.domainAxes(node.shiftX) |
                    this.domainAxes(node.shiftY) |
                    this.domainAxes(node.shiftZ);
                break;
            case 'cache':
            case 'abs':
            case 'cube':
            case 'half_negative':
            case 'log':
            case 'negate':
            case 'quarter_negative':
            case 'reciprocal':
            case 'sign':
            case 'sqrt':
            case 'square':
            case 'squeeze':
            case 'clamp':
            case 'interpolated':
                axes = this.domainAxes(node.input);
                break;
            case 'ceil':
            case 'floor':
            case 'round':
            case 'truncate':
                axes = this.domainAxes(node.input) | this.domainAxes(node.multiple);
                break;
            case 'add':
            case 'div':
            case 'max':
            case 'min':
            case 'mul':
            case 'sub':
                axes = this.domainAxes(node.left) | this.domainAxes(node.right);
                break;
            case 'find_top_surface':
                // This operator ignores the caller's y and returns only a height for the x/z column.
                axes = XZ_AXES;
                break;
            case 'interval_select':
                axes = node.functions.reduce(
                    (result, entry) => result | this.domainAxes(entry),
                    this.domainAxes(node.input)
                );
                break;
            case 'lerp':
                axes = this.domainAxes(node.alpha) | this.domainAxes(node.first) | this.domainAxes(node.second);
                break;
            case 'pow':
                axes = this.domainAxes(node.base) | this.domainAxes(node.exponent);
                break;
            case 'range_choice':
                axes =
                    this.domainAxes(node.input) |
                    this.domainAxes(node.whenInRange) |
                    this.domainAxes(node.whenOutOfRange);
                break;
            case 'slice': {
                const fixedAxis = node.axis === 'x' ? X_AXIS : node.axis === 'y' ? Y_AXIS : Z_AXIS;
                axes = this.domainAxes(node.input) & ~fixedAxis;
                break;
            }
            case 'spline':
                axes = this.splineDomainAxes(node.spline);
                break;
        }

        this.domainAxesByNode.set(node, axes);
        return axes;
    }

    /** Collects coordinate dependencies through the function-valued knots of a spline. */
    private splineDomainAxes(spline: SplineNode): number {
        if (spline.kind === 'constant') return 0;
        return spline.values.reduce(
            (axes, value) => axes | this.splineDomainAxes(value),
            this.domainAxes(spline.coordinate)
        );
    }

    private compileSpline(spline: SplineNode): CompiledSpline {
        if (spline.kind === 'constant') {
            const value = f32(spline.value);
            return () => value;
        }
        const coordinate = this.compile(spline.coordinate);
        return compileMultipointSpline({
            coordinate,
            locations: spline.locations,
            values: spline.values.map((entry) => this.compileSpline(entry)),
            derivatives: spline.derivatives
        });
    }

    private buildUnary(type: string, input: DensitySampler): DensitySampler {
        switch (type) {
            case 'abs':
                return (context, x, y, z) => Math.abs(input(context, x, y, z));
            case 'square':
                return (context, x, y, z) => square(input(context, x, y, z));
            case 'cube':
                return (context, x, y, z) => cube(input(context, x, y, z));
            case 'sqrt':
                return (context, x, y, z) => f32(Math.sqrt(input(context, x, y, z)));
            case 'half_negative':
                return (context, x, y, z) => {
                    const value = input(context, x, y, z);
                    return value > 0 ? value : f32(value * 0.5);
                };
            case 'quarter_negative':
                return (context, x, y, z) => {
                    const value = input(context, x, y, z);
                    return value > 0 ? value : f32(value * 0.25);
                };
            case 'reciprocal':
                return (context, x, y, z) => f32(1 / input(context, x, y, z));
            case 'negate':
                return (context, x, y, z) => -input(context, x, y, z);
            case 'squeeze':
                return (context, x, y, z) => squeeze(input(context, x, y, z));
            case 'log':
                return (context, x, y, z) => f32(Math.log(input(context, x, y, z)));
            case 'sign':
                return (context, x, y, z) => Math.sign(input(context, x, y, z));
            default:
                throw new WorldgenErrors.UnknownUnaryDensityFunction({ type });
        }
    }

    private buildBinary(
        node: DensityFunctionNode & { type: 'add' | 'div' | 'max' | 'min' | 'mul' | 'sub' }
    ): DensitySampler {
        const left = this.compile(node.left);
        const right = this.compile(node.right);
        const leftConstant = isConstant(node.left) ? f32(node.left.value) : undefined;
        const rightConstant = isConstant(node.right) ? f32(node.right.value) : undefined;

        switch (node.type) {
            case 'add':
                if (leftConstant !== undefined)
                    return (context, x, y, z) => f32(right(context, x, y, z) + leftConstant);
                if (rightConstant !== undefined)
                    return (context, x, y, z) => f32(left(context, x, y, z) + rightConstant);
                return (context, x, y, z) => f32(left(context, x, y, z) + right(context, x, y, z));
            case 'sub':
                if (leftConstant !== undefined)
                    return (context, x, y, z) => f32(leftConstant - right(context, x, y, z));
                if (rightConstant !== undefined) {
                    const negated = f32(-rightConstant);
                    return (context, x, y, z) => f32(left(context, x, y, z) + negated);
                }
                return (context, x, y, z) => f32(left(context, x, y, z) - right(context, x, y, z));
            case 'mul':
                if (leftConstant !== undefined)
                    return (context, x, y, z) => f32(right(context, x, y, z) * leftConstant);
                if (rightConstant !== undefined)
                    return (context, x, y, z) => f32(left(context, x, y, z) * rightConstant);
                return (context, x, y, z) => {
                    const value = left(context, x, y, z);
                    return value === 0 ? 0 : f32(value * right(context, x, y, z));
                };
            case 'div':
                if (leftConstant !== undefined)
                    return (context, x, y, z) => f32(leftConstant / right(context, x, y, z));
                if (rightConstant !== undefined) {
                    // Java compiles a constant divisor into a multiply by its reciprocal, and
                    // the two differ in the last bit of a float.
                    const reciprocal = f32(1 / rightConstant);
                    return (context, x, y, z) => f32(left(context, x, y, z) * reciprocal);
                }
                return (context, x, y, z) => {
                    const value = left(context, x, y, z);
                    return value === 0 ? 0 : f32(value / right(context, x, y, z));
                };
            case 'min':
                if (leftConstant !== undefined)
                    return (context, x, y, z) => Math.min(right(context, x, y, z), leftConstant);
                if (rightConstant !== undefined)
                    return (context, x, y, z) => Math.min(left(context, x, y, z), rightConstant);
                return (context, x, y, z) => Math.min(left(context, x, y, z), right(context, x, y, z));
            case 'max':
                if (leftConstant !== undefined)
                    return (context, x, y, z) => Math.max(right(context, x, y, z), leftConstant);
                if (rightConstant !== undefined)
                    return (context, x, y, z) => Math.max(left(context, x, y, z), rightConstant);
                return (context, x, y, z) => Math.max(left(context, x, y, z), right(context, x, y, z));
        }
    }

    private buildPow(node: DensityFunctionNode & { type: 'pow' }): DensitySampler {
        const base = this.compile(node.base);
        const exponent = this.compile(node.exponent);
        if (isConstant(node.base)) {
            const constantBase = f32(node.base.value);
            return (context, x, y, z) => f32(constantBase ** exponent(context, x, y, z));
        }
        if (isConstant(node.exponent)) {
            const value = f32(node.exponent.value);
            const magnitude = Math.abs(value);
            let special: DensitySampler | undefined;
            if (magnitude === 0.5) special = (context, x, y, z) => f32(Math.sqrt(base(context, x, y, z)));
            else if (magnitude === 1) special = base;
            else if (magnitude === 2) special = (context, x, y, z) => square(base(context, x, y, z));
            else if (magnitude === 3) special = (context, x, y, z) => cube(base(context, x, y, z));

            if (!special) return (context, x, y, z) => f32(base(context, x, y, z) ** value);
            if (value >= 0) return special;
            const positive = special;
            return (context, x, y, z) => f32(1 / positive(context, x, y, z));
        }
        return (context, x, y, z) => f32(base(context, x, y, z) ** exponent(context, x, y, z));
    }

    /** A gradient's value as a function of the one coordinate it reads. */
    private gradientAlong(node: DensityFunctionNode & { type: 'gradient' }): (coordinate: number) => number {
        const range = node.toCoordinate - node.fromCoordinate;
        if (range === 0) throw new WorldgenErrors.FlatGradient();
        const factor = f32(f32(f32(node.toValue) - f32(node.fromValue)) / range);
        const fromValue = f32(node.fromValue);
        const fromCoordinate = node.fromCoordinate;

        let sample: (coordinate: number) => number;
        switch (node.tiling) {
            case 'clamp_to_edge': {
                const min = Math.min(node.fromCoordinate, node.toCoordinate);
                const max = Math.max(node.fromCoordinate, node.toCoordinate);
                sample = (coordinate) => f32(fromValue + f32((clamp(coordinate, min, max) - fromCoordinate) * factor));
                break;
            }
            case 'repeat':
                sample = (coordinate) => f32(fromValue + f32(floorMod(coordinate - fromCoordinate, range) * factor));
                break;
            case 'mirrored_repeat':
                sample = (coordinate) => {
                    const relative = coordinate - fromCoordinate;
                    const tile = floorDiv(relative, range);
                    const local = relative - tile * range;
                    return (tile & 1) === 0
                        ? f32(fromValue + f32(local * factor))
                        : f32(fromValue + f32((range - local) * factor));
                };
                break;
        }
        return sample;
    }

    private buildGradient(node: DensityFunctionNode & { type: 'gradient' }): DensitySampler {
        const sample = this.gradientAlong(node);

        // One closure per axis keeps the per-sample path free of axis comparisons; the depth
        // slot reaches a y gradient on every block of a chunk.
        switch (node.axis) {
            case 'x':
                return (_context, x) => sample(x);
            case 'y':
                return (_context, _x, y) => sample(y);
            case 'z':
                return (_context, _x, _y, z) => sample(z);
        }
    }

    /**
     * Builds {@link DensityFunctionCompiler.boundSampler}'s function for one node.
     *
     * Each case rounds its ends the way the sampler rounds its value. Rounding to the nearest
     * float never reorders two values, so an end computed from the extremes of the inputs is
     * still an end after rounding. A case whose input is unbounded is unbounded too, which also
     * covers a NaN sample: only an unbounded input can produce one.
     */
    private buildBound(node: DensityFunctionNode): DensityBoundSampler {
        switch (node.type) {
            case 'constant': {
                const value = f32(node.value);
                if (!Number.isFinite(value)) return unbounded;
                return (_context, _box, out) => {
                    out.lo = value;
                    out.hi = value;
                };
            }

            case 'cache':
                return this.boundSampler(node.input);

            case 'gradient': {
                // Only the clamped gradient moves one way along its axis; a tiled one wraps.
                if (node.tiling !== 'clamp_to_edge') return unbounded;
                const sample = this.gradientAlong(node);
                const axis = node.axis;
                return (_context, box, out) => {
                    const first = sample(axis === 'x' ? box.minX : axis === 'y' ? box.minY : box.minZ);
                    const last = sample(axis === 'x' ? box.maxX : axis === 'y' ? box.maxY : box.maxZ);
                    out.lo = Math.min(first, last);
                    out.hi = Math.max(first, last);
                };
            }

            case 'interpolated': {
                const id = this.cacheId(node);
                const input = this.withNativeProgram(node.input, this.compile(node.input));
                const cellSizeXz = node.cellSizeXz;
                const cellSizeY = node.cellSizeY;
                return (context, box, out) => {
                    const cellX = floorDiv(box.minX, cellSizeXz);
                    const cellY = floorDiv(box.minY, cellSizeY);
                    const cellZ = floorDiv(box.minZ, cellSizeXz);
                    if (
                        floorDiv(box.maxX, cellSizeXz) !== cellX ||
                        floorDiv(box.maxY, cellSizeY) !== cellY ||
                        floorDiv(box.maxZ, cellSizeXz) !== cellZ
                    ) {
                        unbounded(context, box, out);
                        return;
                    }

                    const cache = context.cornerCache(id);
                    let lo = Number.POSITIVE_INFINITY;
                    let hi = Number.NEGATIVE_INFINITY;
                    for (let corner = 0; corner < 8; corner++) {
                        const cornerX = cellX + (corner & 1);
                        const cornerY = cellY + ((corner >> 1) & 1);
                        const cornerZ = cellZ + (corner >> 2);
                        const value = cache.getOrCompute(
                            context,
                            input,
                            cornerX,
                            cornerY,
                            cornerZ,
                            cornerX * cellSizeXz,
                            cornerY * cellSizeY,
                            cornerZ * cellSizeXz
                        );
                        // Math.min and Math.max carry a NaN corner through, which leaves the range unbounded.
                        lo = Math.min(lo, value);
                        hi = Math.max(hi, value);
                    }
                    out.lo = lo;
                    out.hi = hi;
                };
            }

            case 'range_choice': {
                const input = this.boundSampler(node.input);
                const whenInRange = this.boundSampler(node.whenInRange);
                const whenOutOfRange = this.boundSampler(node.whenOutOfRange);
                const min = f32(node.minInclusive);
                const max = f32(node.maxExclusive);
                const chosen: DensityRange = { lo: 0, hi: 0 };
                const other: DensityRange = { lo: 0, hi: 0 };
                return (context, box, out) => {
                    input(context, box, chosen);
                    if (isBounded(chosen)) {
                        if (chosen.lo >= min && chosen.hi < max) {
                            whenInRange(context, box, out);
                            return;
                        }
                        if (chosen.hi < min || chosen.lo >= max) {
                            whenOutOfRange(context, box, out);
                            return;
                        }
                    }
                    // Some samples may fall either side, and a NaN input takes the out of range branch.
                    whenInRange(context, box, chosen);
                    whenOutOfRange(context, box, other);
                    out.lo = Math.min(chosen.lo, other.lo);
                    out.hi = Math.max(chosen.hi, other.hi);
                };
            }

            case 'abs':
            case 'negate':
            case 'square': {
                const type = node.type;
                const input = this.boundSampler(node.input);
                const inner: DensityRange = { lo: 0, hi: 0 };
                return (context, box, out) => {
                    input(context, box, inner);
                    if (!isBounded(inner)) {
                        unbounded(context, box, out);
                        return;
                    }
                    if (type === 'negate') {
                        out.lo = -inner.hi;
                        out.hi = -inner.lo;
                        return;
                    }
                    const least = inner.lo >= 0 ? inner.lo : inner.hi <= 0 ? -inner.hi : 0;
                    const most = Math.max(Math.abs(inner.lo), Math.abs(inner.hi));
                    out.lo = type === 'abs' ? least : square(least);
                    out.hi = type === 'abs' ? most : square(most);
                };
            }

            case 'clamp': {
                const input = this.boundSampler(node.input);
                const min = f32(node.min);
                const max = f32(node.max);
                return (context, box, out) => {
                    input(context, box, out);
                    if (!isBounded(out)) return;
                    out.lo = clamp(out.lo, min, max);
                    out.hi = clamp(out.hi, min, max);
                };
            }

            case 'add':
            case 'sub':
            case 'mul':
            case 'min':
            case 'max': {
                const type = node.type;
                const left = this.boundSampler(node.left);
                const right = this.boundSampler(node.right);
                const a: DensityRange = { lo: 0, hi: 0 };
                const b: DensityRange = { lo: 0, hi: 0 };
                return (context, box, out) => {
                    left(context, box, a);
                    right(context, box, b);
                    if (!isBounded(a) || !isBounded(b)) {
                        unbounded(context, box, out);
                        return;
                    }
                    switch (type) {
                        case 'add':
                            out.lo = f32(a.lo + b.lo);
                            out.hi = f32(a.hi + b.hi);
                            return;
                        case 'sub':
                            out.lo = f32(a.lo - b.hi);
                            out.hi = f32(a.hi - b.lo);
                            return;
                        case 'mul': {
                            const p0 = f32(a.lo * b.lo);
                            const p1 = f32(a.lo * b.hi);
                            const p2 = f32(a.hi * b.lo);
                            const p3 = f32(a.hi * b.hi);
                            out.lo = Math.min(p0, p1, p2, p3);
                            out.hi = Math.max(p0, p1, p2, p3);
                            return;
                        }
                        case 'min':
                            out.lo = Math.min(a.lo, b.lo);
                            out.hi = Math.min(a.hi, b.hi);
                            return;
                        case 'max':
                            out.lo = Math.max(a.lo, b.lo);
                            out.hi = Math.max(a.hi, b.hi);
                            return;
                    }
                };
            }

            default:
                return unbounded;
        }
    }

    private buildNoise(node: DensityFunctionNode & { type: 'noise' }): DensitySampler {
        const noise = this.environment.noise(node.noise);
        const xzScale = node.xzScale;
        const yScale = node.yScale;
        const plainX = isConstant(node.shiftX) && node.shiftX.value === 0;
        const plainY = isConstant(node.shiftY) && node.shiftY.value === 0;
        const plainZ = isConstant(node.shiftZ) && node.shiftZ.value === 0;

        if (plainX && plainY && plainZ) {
            return (_context, x, y, z) => noise.get3(x * xzScale, y * yScale, z * xzScale);
        }

        const shiftX = this.compile(node.shiftX);
        const shiftZ = this.compile(node.shiftZ);
        if (plainY) {
            return (context, x, y, z) =>
                noise.get3(x * xzScale + shiftX(context, x, y, z), y * yScale, z * xzScale + shiftZ(context, x, y, z));
        }

        const shiftY = this.compile(node.shiftY);
        return (context, x, y, z) =>
            noise.get3(
                x * xzScale + shiftX(context, x, y, z),
                y * yScale + shiftY(context, x, y, z),
                z * xzScale + shiftZ(context, x, y, z)
            );
    }
}
