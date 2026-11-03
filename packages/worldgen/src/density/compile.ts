import { clamp, f32, floor, floorDiv, floorMod, lerpF } from '../math';
import { BLENDED_NOISE_SEED, createBlendedNoiseSampler } from '../noise/BlendedNoise';
import type { Noise } from '../noise/GradientNoise';
import { SimplexNoise } from '../noise/SimplexNoise';
import type { RandomSource } from '../random/RandomSource';
import type { CompiledSpline } from './CubicSpline';
import { compileMultipointSpline } from './CubicSpline';
import type { DensityFunctionNode, DistanceMetric, SplineNode } from './DensityFunction';
import { densityInputsOf } from './DensityFunction';
import type { SampleContext } from './SampleContext';

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

/** Large datapack interpolation cells stay on the scalar path to avoid large per-context buffers. */
const MAX_INTERPOLATION_BUFFER_VALUES = 4096;

const constantSampler = (value: number): DensitySampler => {
    const narrowed = f32(value);
    return () => narrowed;
};

const isConstant = (node: DensityFunctionNode): node is { type: 'constant'; value: number } => node.type === 'constant';

const square = (value: number): number => f32(value * value);
const cube = (value: number): number => f32(f32(value * value) * value);

const squeeze = (value: number): number => {
    const clamped = clamp(value, -1, 1);
    return f32(f32(clamped / 2) - f32(cube(clamped) / 24));
};

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
 * One compiler serves every function of one {@link import('../RandomState').RandomState}: it
 * memoizes by tree identity and hands out the cache slot ids that `cache` nodes share, which
 * is what makes `continents` cost one noise evaluation per position even though the router
 * reaches it through five different slots.
 */
export class DensityFunctionCompiler {
    private readonly compiled = new Map<DensityFunctionNode, DensitySampler>();
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

    /** Builds an evaluator from a closed set of AST kinds, leaving stateful nodes as captures. */
    private buildGenerated(node: DensityFunctionNode): DensitySampler | undefined {
        const captures: DensitySampler[] = [];
        const constants: number[] = [];
        const constant = (value: number): string => {
            const index = constants.push(f32(value)) - 1;
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
        constant: (value: number) => string,
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
                const fixed = constant(node.coordinate);
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
                const sample = createBlendedNoiseSampler(this.environment.random(BLENDED_NOISE_SEED), node);
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
                if (!lastSampler) throw new RangeError('interval_select needs at least one function');
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
                const input = this.compile(node.input);
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
                if (!this.precomputeInterpolationCells || bufferValueCount > MAX_INTERPOLATION_BUFFER_VALUES) {
                    return sampleAt;
                }

                const fillCell = (
                    context: SampleContext,
                    cellX: number,
                    cellY: number,
                    cellZ: number,
                    output: Float64Array
                ): void => {
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

                    const base = id << 3;
                    const corners = context.interpolationCorners;
                    const scratch = context.interpolationBufferScratch(id, cellSizeXz * 4 + cellSizeXz * cellSizeY * 2);
                    const verticalOffset = cellSizeXz * 4;
                    // Reuse each x-stage across y/z, then each x/y-stage across z, preserving Java's f32 lerp order.
                    for (let localX = 0; localX < cellSizeXz; localX++) {
                        const alphaX = alphaXz[localX] ?? 0;
                        const horizontalBase = localX * 4;
                        const cornerBase = base;
                        const c0 = corners[cornerBase] ?? 0;
                        const c1 = corners[cornerBase + 1] ?? 0;
                        const c2 = corners[cornerBase + 2] ?? 0;
                        const c3 = corners[cornerBase + 3] ?? 0;
                        const c4 = corners[cornerBase + 4] ?? 0;
                        const c5 = corners[cornerBase + 5] ?? 0;
                        const c6 = corners[cornerBase + 6] ?? 0;
                        const c7 = corners[cornerBase + 7] ?? 0;
                        const p0 = f32(c0 + f32(alphaX * f32(c1 - c0)));
                        const p1 = f32(c2 + f32(alphaX * f32(c3 - c2)));
                        const p2 = f32(c4 + f32(alphaX * f32(c5 - c4)));
                        const p3 = f32(c6 + f32(alphaX * f32(c7 - c6)));
                        scratch[horizontalBase] = p0;
                        scratch[horizontalBase + 1] = p1;
                        scratch[horizontalBase + 2] = p2;
                        scratch[horizontalBase + 3] = p3;

                        for (let localY = 0; localY < cellSizeY; localY++) {
                            const alphaYWeight = alphaY[localY] ?? 0;
                            const verticalBase = verticalOffset + (localX * cellSizeY + localY) * 2;
                            scratch[verticalBase] = f32(p0 + f32(alphaYWeight * f32(p1 - p0)));
                            scratch[verticalBase + 1] = f32(p2 + f32(alphaYWeight * f32(p3 - p2)));
                        }

                        for (let localZ = 0; localZ < cellSizeXz; localZ++) {
                            const alphaZ = alphaXz[localZ] ?? 0;
                            const outputBase = (localX * cellSizeXz + localZ) * cellSizeY;
                            for (let localY = cellSizeY - 1; localY >= 0; localY--) {
                                const verticalBase = verticalOffset + (localX * cellSizeY + localY) * 2;
                                const q0 = scratch[verticalBase] ?? 0;
                                const q1 = scratch[verticalBase + 1] ?? 0;
                                output[outputBase + localY] =
                                    localX === 0 && localY === 0 && localZ === 0
                                        ? (corners[base] ?? 0)
                                        : f32(q0 + f32(alphaZ * f32(q1 - q0)));
                            }
                        }
                    }
                };

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

                    const output = context.interpolationBuffer(id, bufferValueCount);
                    fillCell(context, x0 / cellSizeXz, y0 / cellSizeY, z0 / cellSizeXz, output);
                    context.markInterpolationBufferFilled(id, x0, y0, z0);
                    return output[outputIndex] ?? 0;
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

        throw new TypeError(`Cannot compile density function node ${JSON.stringify(node)}`);
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
                throw new TypeError(`Unknown unary density function ${type}`);
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

    private buildGradient(node: DensityFunctionNode & { type: 'gradient' }): DensitySampler {
        const range = node.toCoordinate - node.fromCoordinate;
        if (range === 0) throw new RangeError('gradient from_coordinate cannot equal to_coordinate');
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
