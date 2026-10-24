import { clamp, f32, floor, floorDiv, floorMod, lerp3F, lerpF } from '../math';
import { createBlendedNoiseSampler, BLENDED_NOISE_SEED } from '../noise/BlendedNoise';
import type { Noise } from '../noise/GradientNoise';
import { SimplexNoise } from '../noise/SimplexNoise';
import type { RandomSource } from '../random/RandomSource';
import type { CompiledSpline } from './CubicSpline';
import { compileMultipointSpline } from './CubicSpline';
import type { DensityFunctionNode, DistanceMetric, SplineNode } from './DensityFunction';
import type { InterpolationGrid, SampleContext } from './SampleContext';

/** A compiled density function: one closure that reads a position and the chunk context. */
export type DensitySampler = (context: SampleContext, x: number, y: number, z: number) => number;

/** What the compiler needs from the world seed to turn a tree into closures. */
export interface CompileEnvironment {
    /** Returns the seeded noise instance for a `worldgen/noise` identifier. */
    noise(id: string): Noise;
    /** Returns the random source keyed by a name, used by `old_blended_noise`. */
    random(id: string): RandomSource;
    /** Returns the legacy random source the outer end islands are seeded from. */
    endIslandRandom(): RandomSource;
}

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

/** Reads one interpolation cell corner, computing and recording it on first visit. */
const cornerValue = (
    grid: InterpolationGrid,
    context: SampleContext,
    input: DensitySampler,
    x: number,
    y: number,
    z: number
): number => {
    let byY = grid.get(x);
    if (!byY) {
        byY = new Map();
        grid.set(x, byY);
    }
    let byZ = byY.get(y);
    if (!byZ) {
        byZ = new Map();
        byY.set(y, byZ);
    }
    const cached = byZ.get(z);
    if (cached !== undefined) return cached;
    const value = input(context, x, y, z);
    byZ.set(z, value);
    return value;
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
    private nextCacheId = 0;

    public constructor(private readonly environment: CompileEnvironment) {}

    /** How many memo slots the trees compiled so far need. */
    public get cacheCount(): number {
        return this.nextCacheId;
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
        const sampler = this.build(node);
        this.compiled.set(node, sampler);
        return sampler;
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
                return (context, x, y, z) => {
                    const xInCell = floorMod(x, cellSizeXz);
                    const yInCell = floorMod(y, cellSizeY);
                    const zInCell = floorMod(z, cellSizeXz);
                    const x0 = x - xInCell;
                    const y0 = y - yInCell;
                    const z0 = z - zInCell;
                    const grid = context.interpolationGrid(id);
                    if (xInCell === 0 && yInCell === 0 && zInCell === 0) {
                        return cornerValue(grid, context, input, x0, y0, z0);
                    }

                    const x1 = x0 + cellSizeXz;
                    const y1 = y0 + cellSizeY;
                    const z1 = z0 + cellSizeXz;
                    return lerp3F(
                        f32(xInCell / cellSizeXz),
                        f32(yInCell / cellSizeY),
                        f32(zInCell / cellSizeXz),
                        cornerValue(grid, context, input, x0, y0, z0),
                        cornerValue(grid, context, input, x1, y0, z0),
                        cornerValue(grid, context, input, x0, y1, z0),
                        cornerValue(grid, context, input, x1, y1, z0),
                        cornerValue(grid, context, input, x0, y0, z1),
                        cornerValue(grid, context, input, x1, y0, z1),
                        cornerValue(grid, context, input, x0, y1, z1),
                        cornerValue(grid, context, input, x1, y1, z1)
                    );
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
        const axis = node.axis;
        const pick = (x: number, y: number, z: number): number => (axis === 'x' ? x : axis === 'y' ? y : z);

        switch (node.tiling) {
            case 'clamp_to_edge': {
                const min = Math.min(node.fromCoordinate, node.toCoordinate);
                const max = Math.max(node.fromCoordinate, node.toCoordinate);
                return (_context, x, y, z) =>
                    f32(fromValue + f32((clamp(pick(x, y, z), min, max) - fromCoordinate) * factor));
            }
            case 'repeat':
                return (_context, x, y, z) =>
                    f32(fromValue + f32(floorMod(pick(x, y, z) - fromCoordinate, range) * factor));
            case 'mirrored_repeat':
                return (_context, x, y, z) => {
                    const relative = pick(x, y, z) - fromCoordinate;
                    const tile = floorDiv(relative, range);
                    const local = relative - tile * range;
                    return (tile & 1) === 0
                        ? f32(fromValue + f32(local * factor))
                        : f32(fromValue + f32((range - local) * factor));
                };
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
