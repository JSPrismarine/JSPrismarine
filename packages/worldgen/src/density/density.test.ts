import { describe, expect, it } from 'vitest';

import { f32, lerp3F } from '../math';
import type { Noise } from '../noise/GradientNoise';
import { LegacyRandomSource } from '../random/LegacyRandomSource';
import type { CompileEnvironment } from './compile';
import { DensityFunctionCompiler } from './compile';
import { DENSITY_FUNCTION_TYPES } from './DensityFunction';
import { parseDensityFunction } from './parse';
import { SampleContext } from './SampleContext';

/** A noise whose value is a plain function of position, so expectations stay hand-computable. */
const linearNoise: Noise = {
    get3: (x, y, z) => f32(x + y * 2 + z * 3),
    get2: (x, z) => f32(x + z * 3)
};

interface Harness {
    sample: (x: number, y: number, z: number) => number;
    context: SampleContext;
    noiseCalls: () => number;
}

const harness = (json: unknown, environment?: Partial<CompileEnvironment>): Harness => {
    let noiseCalls = 0;
    const countingNoise: Noise = {
        get3: (x, y, z) => {
            noiseCalls++;
            return linearNoise.get3(x, y, z);
        },
        get2: (x, z) => {
            noiseCalls++;
            return linearNoise.get2(x, z);
        }
    };

    const node = parseDensityFunction(json, (id) => {
        throw new RangeError(`No density function is registered as ${id}`);
    });
    const compiler = new DensityFunctionCompiler({
        noise: () => countingNoise,
        random: () => new LegacyRandomSource(1234n),
        endIslandRandom: () => new LegacyRandomSource(1234n),
        ...environment
    });
    const sampler = compiler.compile(node);
    const context = new SampleContext();
    return { sample: (x, y, z) => sampler(context, x, y, z), context, noiseCalls: () => noiseCalls };
};

const at = (json: unknown, x = 0, y = 0, z = 0): number => harness(json).sample(x, y, z);

const unary = (type: string, input: number): number => at({ type: `minecraft:${type}`, input });
const binary = (type: string, left: unknown, right: unknown): number => at({ type: `minecraft:${type}`, left, right });

describe('parsing', () => {
    it('reads a bare number as a constant', () => {
        expect(at(2.5)).toBe(2.5);
    });

    it('resolves a bare string through the resolver', () => {
        const node = parseDensityFunction('minecraft:example', () => ({ type: 'constant', value: 7 }));
        expect(node).toEqual({ type: 'constant', value: 7 });
    });

    it('expands an unprefixed reference to the minecraft namespace', () => {
        const seen: string[] = [];
        parseDensityFunction('overworld/depth', (id) => {
            seen.push(id);
            return { type: 'constant', value: 0 };
        });
        expect(seen).toEqual(['minecraft:overworld/depth']);
    });

    it('rejects an unknown type instead of falling back to zero', () => {
        expect(() => at({ type: 'minecraft:flat_cache', argument: 1 })).toThrow(
            /unknown density function type minecraft:flat_cache/
        );
    });

    it('names the path to a bad field', () => {
        expect(() => at({ type: 'minecraft:add', left: 1, right: { type: 'minecraft:abs' } })).toThrow(
            /<root>\.right\.input/
        );
    });

    it('rejects a clamp whose maximum is below its minimum', () => {
        expect(() => at({ type: 'minecraft:clamp', input: 0, min: 1, max: 0 })).toThrow(/less than or equal/);
    });

    it('rejects an interval_select whose threshold count does not fit its functions', () => {
        expect(() =>
            at({ type: 'minecraft:interval_select', input: 0, thresholds: [0, 1], functions: [1, 2] })
        ).toThrow(/expected 1 thresholds for 2 functions/);
    });

    it('rejects spline points that are not in ascending order', () => {
        expect(() =>
            at({
                type: 'minecraft:spline',
                spline: {
                    coordinate: {
                        type: 'minecraft:gradient',
                        axis: 'y',
                        from_coordinate: 0,
                        to_coordinate: 1,
                        from_value: 0,
                        to_value: 1
                    },
                    points: [
                        { location: 1, value: 0 },
                        { location: 0, value: 1 }
                    ]
                }
            })
        ).toThrow(/ascending location order/);
    });

    it('declares the 44 operator types 26.3 registers', () => {
        expect(new Set(DENSITY_FUNCTION_TYPES).size).toBe(44);
    });
});

describe('unary operators', () => {
    it('computes abs', () => {
        expect(unary('abs', -2.5)).toBe(2.5);
        expect(unary('abs', 2.5)).toBe(2.5);
    });

    it('computes square and cube', () => {
        expect(unary('square', 1.5)).toBe(2.25);
        expect(unary('cube', 1.5)).toBe(3.375);
        expect(unary('cube', -2)).toBe(-8);
    });

    it('computes sqrt', () => {
        expect(unary('sqrt', 9)).toBe(3);
    });

    it('leaves positive input alone and scales negative input', () => {
        expect(unary('half_negative', 2)).toBe(2);
        expect(unary('half_negative', -2)).toBe(-1);
        expect(unary('quarter_negative', 2)).toBe(2);
        expect(unary('quarter_negative', -2)).toBe(-0.5);
    });

    it('computes reciprocal and negate', () => {
        expect(unary('reciprocal', 4)).toBe(0.25);
        expect(unary('negate', 2.5)).toBe(-2.5);
    });

    it('clamps the input before squeezing it', () => {
        // squeeze(x) = x/2 - x^3/24 on [-1, 1]; an input of 2 clamps to 1 first.
        expect(unary('squeeze', 1)).toBe(f32(0.5 - 1 / 24));
        expect(unary('squeeze', 2)).toBe(f32(0.5 - 1 / 24));
        expect(unary('squeeze', 0)).toBe(0);
    });

    it('computes the natural logarithm and the sign', () => {
        expect(unary('log', 1)).toBe(0);
        expect(unary('sign', -3)).toBe(-1);
        expect(unary('sign', 0)).toBe(0);
        expect(unary('sign', 3)).toBe(1);
    });
});

describe('rounding operators', () => {
    it('rounds to an integer when the multiple is one', () => {
        expect(unary('floor', 2.7)).toBe(2);
        expect(unary('floor', -2.1)).toBe(-3);
        expect(unary('ceil', 2.1)).toBe(3);
        expect(unary('round', 2.5)).toBe(3);
        expect(unary('round', -2.5)).toBe(-2);
        expect(unary('truncate', 2.7)).toBe(2);
        expect(unary('truncate', -2.7)).toBe(-2);
    });

    it('rounds to a multiple when one is given', () => {
        expect(at({ type: 'minecraft:floor', input: 12, multiple: 5 })).toBe(10);
        expect(at({ type: 'minecraft:ceil', input: 12, multiple: 5 })).toBe(15);
    });

    it('passes the input through when the multiple is zero', () => {
        expect(at({ type: 'minecraft:floor', input: 12.5, multiple: 0 })).toBe(12.5);
    });
});

describe('binary operators', () => {
    it('computes add, sub, mul, min and max', () => {
        expect(binary('add', 2, 3)).toBe(5);
        expect(binary('sub', 2, 3)).toBe(-1);
        expect(binary('mul', 2, 3)).toBe(6);
        expect(binary('min', 2, 3)).toBe(2);
        expect(binary('max', 2, 3)).toBe(3);
    });

    it('divides by a power of two exactly', () => {
        expect(binary('div', 6, 4)).toBe(1.5);
    });

    it('compiles a constant divisor into a multiply by its reciprocal, as Java does', () => {
        // Java only takes that path when the dividend is not itself constant, so the left
        // operand here goes through `abs`. 7 / 3 is 2.3333333 and 7 * fround(1/3) is
        // 2.3333335, which is the difference the specialization makes.
        const left = { type: 'minecraft:abs', input: 7 };
        expect(binary('div', left, 3)).toBe(f32(7 * f32(1 / 3)));
        expect(binary('div', left, 3)).not.toBe(f32(7 / 3));
        // With both operands constant Java divides directly instead.
        expect(binary('div', 7, 3)).toBe(f32(7 / 3));
    });

    it('short-circuits a zero left operand of mul and div', () => {
        const zeroTimesNoise = harness({
            type: 'minecraft:mul',
            left: { type: 'minecraft:mul', left: 0, right: { type: 'minecraft:noise', noise: 'minecraft:test' } },
            right: { type: 'minecraft:noise', noise: 'minecraft:test' }
        });
        expect(zeroTimesNoise.sample(4, 8, 12)).toBe(0);
        // The inner noise still runs; the outer multiply skips its right operand.
        expect(zeroTimesNoise.noiseCalls()).toBe(1);
    });
});

describe('selection operators', () => {
    it('clamps into the declared range', () => {
        expect(at({ type: 'minecraft:clamp', input: 5, min: 0, max: 3 })).toBe(3);
        expect(at({ type: 'minecraft:clamp', input: -5, min: 0, max: 3 })).toBe(0);
        expect(at({ type: 'minecraft:clamp', input: 1.5, min: 0, max: 3 })).toBe(1.5);
    });

    it('interpolates between first and second', () => {
        expect(at({ type: 'minecraft:lerp', alpha: 0.25, first: 0, second: 8 })).toBe(2);
        expect(at({ type: 'minecraft:lerp', alpha: 0, first: 5, second: 8 })).toBe(5);
        expect(at({ type: 'minecraft:lerp', alpha: 1, first: 5, second: 8 })).toBe(8);
    });

    it('treats the range_choice maximum as exclusive', () => {
        const choice = (input: number): number =>
            at({
                type: 'minecraft:range_choice',
                input,
                min_inclusive: 0,
                max_exclusive: 10,
                when_in_range: 1,
                when_out_of_range: -1
            });
        expect(choice(0)).toBe(1);
        expect(choice(9.9)).toBe(1);
        expect(choice(10)).toBe(-1);
        expect(choice(-0.1)).toBe(-1);
    });

    it('selects the function below the first threshold the input falls under', () => {
        const select = (input: number): number =>
            at({
                type: 'minecraft:interval_select',
                input,
                thresholds: [-1, 1],
                functions: [10, 20, 30]
            });
        expect(select(-2)).toBe(10);
        expect(select(0)).toBe(20);
        expect(select(5)).toBe(30);
    });

    it('raises a base to an exponent', () => {
        expect(at({ type: 'minecraft:pow', base: 2, exponent: 10 })).toBe(1024);
        expect(at({ type: 'minecraft:pow', base: 9, exponent: 0.5 })).toBe(3);
        expect(at({ type: 'minecraft:pow', base: 2, exponent: -2 })).toBe(0.25);
    });
});

describe('position operators', () => {
    const yGradient = {
        type: 'minecraft:gradient',
        axis: 'y',
        from_coordinate: -64,
        to_coordinate: 64,
        from_value: 0,
        to_value: 1
    };

    it('clamps a gradient to its end values by default', () => {
        expect(at(yGradient, 0, -64, 0)).toBe(0);
        expect(at(yGradient, 0, 0, 0)).toBe(0.5);
        expect(at(yGradient, 0, 64, 0)).toBe(1);
        expect(at(yGradient, 0, 500, 0)).toBe(1);
        expect(at(yGradient, 0, -500, 0)).toBe(0);
    });

    it('repeats a gradient when asked to', () => {
        const repeating = { ...yGradient, from_coordinate: 0, to_coordinate: 4, tiling: 'repeat' };
        expect(at(repeating, 0, 1, 0)).toBe(0.25);
        expect(at(repeating, 0, 5, 0)).toBe(0.25);
        expect(at(repeating, 0, -3, 0)).toBe(0.25);
    });

    it('mirrors a gradient on alternate tiles', () => {
        const mirrored = { ...yGradient, from_coordinate: 0, to_coordinate: 4, tiling: 'mirrored_repeat' };
        expect(at(mirrored, 0, 1, 0)).toBe(0.25);
        expect(at(mirrored, 0, 5, 0)).toBe(0.75);
        expect(at(mirrored, 0, 7, 0)).toBe(0.25);
    });

    it('rejects a gradient with no coordinate span', () => {
        expect(() => at({ ...yGradient, from_coordinate: 4, to_coordinate: 4 })).toThrow(RangeError);
    });

    it('pins one axis with slice', () => {
        const sliced = { type: 'minecraft:slice', axis: 'y', coordinate: 64, input: yGradient };
        expect(at(sliced, 0, -64, 0)).toBe(1);
        expect(at(sliced, 0, 0, 0)).toBe(1);
    });

    it('measures distance to a point with each metric', () => {
        const distance = (metric: string): number =>
            at({ type: 'minecraft:distance_to_point', point: [0, 0, 0], metric }, 3, 4, 0);
        expect(distance('euclidean')).toBe(5);
        expect(distance('euclidean_squared')).toBe(25);
        expect(distance('manhattan')).toBe(7);
        expect(distance('chebyshev')).toBe(4);
    });
});

describe('cell operators', () => {
    const yGradient = {
        type: 'minecraft:gradient',
        axis: 'y',
        from_coordinate: 0,
        to_coordinate: 8,
        from_value: 0,
        to_value: 1
    };

    it('interpolates between cell corners', () => {
        const interpolated = { type: 'minecraft:interpolated', input: yGradient, cell_size_xz: 4, cell_size_y: 8 };
        expect(at(interpolated, 0, 0, 0)).toBe(0);
        expect(at(interpolated, 0, 4, 0)).toBe(0.5);
        expect(at(interpolated, 0, 8, 0)).toBe(1);
    });

    it('interpolates exactly as lerp3F does', () => {
        // The compiled node spells `lerp3F` out rather than calling it, because V8 does not
        // inline it on this path. These are the bits that spelling has to keep producing.
        const input = { type: 'minecraft:noise', noise: 'minecraft:test' };
        const run = harness({ type: 'minecraft:interpolated', input, cell_size_xz: 4, cell_size_y: 8 });
        const corner = harness(input);

        for (let x = 3; x < 9; x++) {
            for (let y = 7; y < 17; y++) {
                for (let z = -5; z < 1; z++) {
                    const x0 = Math.floor(x / 4) * 4;
                    const y0 = Math.floor(y / 8) * 8;
                    const z0 = Math.floor(z / 4) * 4;
                    const expected = lerp3F(
                        f32((x - x0) / 4),
                        f32((y - y0) / 8),
                        f32((z - z0) / 4),
                        corner.sample(x0, y0, z0),
                        corner.sample(x0 + 4, y0, z0),
                        corner.sample(x0, y0 + 8, z0),
                        corner.sample(x0 + 4, y0 + 8, z0),
                        corner.sample(x0, y0, z0 + 4),
                        corner.sample(x0 + 4, y0, z0 + 4),
                        corner.sample(x0, y0 + 8, z0 + 4),
                        corner.sample(x0 + 4, y0 + 8, z0 + 4)
                    );
                    expect(run.sample(x, y, z)).toBe(expected);
                    if (x === 5 && y === 8 && z === 0) run.context.reset();
                }
            }
        }
    });

    it('keeps exact interpolation when a data-driven y size collides in the stage cache', () => {
        const cellSizeXz = 4;
        const cellSizeY = 20;
        const input = { type: 'minecraft:noise', noise: 'minecraft:test' };
        const run = harness({
            type: 'minecraft:interpolated',
            input,
            cell_size_xz: cellSizeXz,
            cell_size_y: cellSizeY
        });
        const corner = harness(input);

        for (let z = 0; z < cellSizeXz; z++) {
            for (let y = cellSizeY - 1; y >= 0; y--) {
                const expected = lerp3F(
                    f32(1 / cellSizeXz),
                    f32(y / cellSizeY),
                    f32(z / cellSizeXz),
                    corner.sample(0, 0, 0),
                    corner.sample(cellSizeXz, 0, 0),
                    corner.sample(0, cellSizeY, 0),
                    corner.sample(cellSizeXz, cellSizeY, 0),
                    corner.sample(0, 0, cellSizeXz),
                    corner.sample(cellSizeXz, 0, cellSizeXz),
                    corner.sample(0, cellSizeY, cellSizeXz),
                    corner.sample(cellSizeXz, cellSizeY, cellSizeXz)
                );
                expect(run.sample(1, y, z)).toBe(expected);
            }
        }
    });

    it('invalidates cached interpolation stages when the context resets', () => {
        let offset = 0;
        const run = harness(
            {
                type: 'minecraft:interpolated',
                input: { type: 'minecraft:noise', noise: 'minecraft:test' },
                cell_size_xz: 4,
                cell_size_y: 8
            },
            {
                noise: () => ({
                    get3: (x, y, z) => f32(x + y * 2 + z * 3 + offset),
                    get2: (x, z) => f32(x + z * 3 + offset)
                })
            }
        );

        const beforeReset = run.sample(1, 1, 1);
        offset = 64;
        run.context.reset();

        expect(run.sample(1, 1, 1)).toBe(beforeReset + offset);
    });

    it('evaluates each cell corner once and reuses it', () => {
        const run = harness({
            type: 'minecraft:interpolated',
            input: { type: 'minecraft:noise', noise: 'minecraft:test' },
            cell_size_xz: 4,
            cell_size_y: 8
        });
        // A position that is itself a corner costs one evaluation.
        run.sample(4, 8, 4);
        expect(run.noiseCalls()).toBe(1);
        // An interior position needs the other seven corners of the same cell.
        run.sample(5, 8, 4);
        expect(run.noiseCalls()).toBe(8);
        // Every later position in that cell is pure interpolation.
        run.sample(6, 12, 6);
        expect(run.noiseCalls()).toBe(8);
        // Resetting the context drops the grid.
        run.context.reset();
        run.sample(5, 8, 4);
        expect(run.noiseCalls()).toBe(16);
    });

    it('evaluates a chunk-sized walk once per corner of the lattice', () => {
        const run = harness({
            type: 'minecraft:interpolated',
            input: { type: 'minecraft:noise', noise: 'minecraft:test' },
            cell_size_xz: 4,
            cell_size_y: 8
        });

        // The order the terrain pass walks a chunk in: a column at a time, top down. The
        // lattice over 16 by 384 by 16 blocks is 5 by 49 by 5 corners, and a cache indexed by
        // hash rather than by cell used to recompute four fifths of them.
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                for (let y = 319; y >= -64; y--) run.sample(x, y, z);
            }
        }

        expect(run.noiseCalls()).toBe(5 * 49 * 5);
    });

    it('walks down from the upper bound until the density turns positive', () => {
        // density(y) = 1 - y / 32, so the first probe above zero is y = 24.
        const density = {
            type: 'minecraft:gradient',
            axis: 'y',
            from_coordinate: 0,
            to_coordinate: 64,
            from_value: 1,
            to_value: -1
        };
        const top = {
            type: 'minecraft:find_top_surface',
            density,
            upper_bound: 64,
            lower_bound: -64,
            cell_height: 8
        };
        expect(at(top, 7, 0, 7)).toBe(24);
    });

    it('returns the lower bound when the upper bound is already below it', () => {
        const top = {
            type: 'minecraft:find_top_surface',
            density: 1,
            upper_bound: -100,
            lower_bound: -64,
            cell_height: 8
        };
        expect(at(top, 0, 0, 0)).toBe(-64);
    });
});

describe('caching', () => {
    it('is transparent to the value', () => {
        expect(at({ type: 'minecraft:cache', input: { type: 'minecraft:add', left: 2, right: 3 } })).toBe(5);
    });

    it('evaluates its input once per position', () => {
        const run = harness({
            type: 'minecraft:add',
            left: { type: 'minecraft:cache', input: { type: 'minecraft:noise', noise: 'minecraft:test' } },
            right: { type: 'minecraft:cache', input: { type: 'minecraft:noise', noise: 'minecraft:test' } }
        });
        run.sample(1, 2, 3);
        expect(run.noiseCalls()).toBe(2);
        run.sample(1, 2, 3);
        expect(run.noiseCalls()).toBe(2);
        run.sample(1, 2, 4);
        expect(run.noiseCalls()).toBe(4);
    });

    it('forgets its memo when the context resets', () => {
        const run = harness({ type: 'minecraft:cache', input: { type: 'minecraft:noise', noise: 'minecraft:test' } });
        run.sample(1, 2, 3);
        run.context.reset();
        run.sample(1, 2, 3);
        expect(run.noiseCalls()).toBe(2);
    });
});

describe('noise operators', () => {
    it('scales the sample coordinates', () => {
        // The stub noise is x + 2y + 3z, so the scales show up directly in the result.
        expect(at({ type: 'minecraft:noise', noise: 'minecraft:test', xz_scale: 2, y_scale: 0.5 }, 1, 4, 1)).toBe(
            f32(2 + 4 + 6)
        );
    });

    it('offsets the sample coordinates by the shift inputs', () => {
        expect(
            at(
                {
                    type: 'minecraft:noise',
                    noise: 'minecraft:test',
                    xz_scale: 1,
                    y_scale: 1,
                    shift_x: 10,
                    shift_z: 100
                },
                0,
                0,
                0
            )
        ).toBe(f32(10 + 300));
    });

    it('applies the 0.25 coordinate factor and 4.0 value factor of the shift family', () => {
        expect(at({ type: 'minecraft:shift', noise: 'minecraft:test' }, 4, 8, 12)).toBe(f32((1 + 4 + 9) * 4));
        expect(at({ type: 'minecraft:shift_a', noise: 'minecraft:test' }, 4, 8, 12)).toBe(f32((1 + 0 + 9) * 4));
        expect(at({ type: 'minecraft:shift_b', noise: 'minecraft:test' }, 4, 8, 12)).toBe(f32((3 + 2 + 0) * 4));
    });
});

describe('chunk context operators', () => {
    it('defaults blend_alpha to one, blend_offset to zero and beardifier to zero', () => {
        expect(at({ type: 'minecraft:blend_alpha' })).toBe(1);
        expect(at({ type: 'minecraft:blend_offset' })).toBe(0);
        expect(at({ type: 'minecraft:beardifier' })).toBe(0);
    });

    it('reads the overrides a chunk installs', () => {
        const run = harness({ type: 'minecraft:blend_alpha' });
        run.context.blendAlpha = () => 0.25;
        expect(run.sample(0, 0, 0)).toBe(0.25);
    });

    it('passes blend_density through untouched without a blender', () => {
        expect(at({ type: 'minecraft:blend_density', input: 7 })).toBe(7);
    });

    it('lets a blender rewrite blend_density', () => {
        const run = harness({ type: 'minecraft:blend_density', input: 7 });
        run.context.blendDensity = (_x, _y, _z, density) => density * 2;
        expect(run.sample(0, 0, 0)).toBe(14);
    });
});

describe('splines', () => {
    // A gradient wide enough that the spline coordinate is just the x position.
    const coordinate = {
        type: 'minecraft:gradient',
        axis: 'x',
        from_coordinate: -1000,
        to_coordinate: 1000,
        from_value: -1000,
        to_value: 1000
    };

    const spline = (points: unknown[]): unknown => ({
        type: 'minecraft:spline',
        spline: { coordinate, points }
    });

    it('returns the knot value exactly at a knot', () => {
        const curve = spline([
            { location: 0, value: 1 },
            { location: 10, value: 3 }
        ]);
        expect(at(curve, 0, 0, 0)).toBe(1);
        expect(at(curve, 10, 0, 0)).toBe(3);
    });

    it('interpolates linearly between knots with zero derivatives', () => {
        const curve = spline([
            { location: 0, value: 0, derivative: 0 },
            { location: 10, value: 10, derivative: 0 }
        ]);
        // With both derivatives zero the Hermite term vanishes only at t = 0.5, where the
        // curve passes through the midpoint of the chord.
        expect(at(curve, 5, 0, 0)).toBe(5);
    });

    it('extends past the end knots along their derivatives', () => {
        const curve = spline([
            { location: 0, value: 0, derivative: 2 },
            { location: 10, value: 10, derivative: 3 }
        ]);
        expect(at(curve, -5, 0, 0)).toBe(-10);
        expect(at(curve, 20, 0, 0)).toBe(40);
    });

    it('holds the end value flat when the end derivative is zero', () => {
        const curve = spline([
            { location: 0, value: 4, derivative: 0 },
            { location: 10, value: 8, derivative: 0 }
        ]);
        expect(at(curve, -100, 0, 0)).toBe(4);
        expect(at(curve, 100, 0, 0)).toBe(8);
    });

    it('applies the Hermite term when a derivative is non-zero', () => {
        const curve = spline([
            { location: 0, value: 0, derivative: 1 },
            { location: 1, value: 0, derivative: 0 }
        ]);
        // At t = 0.5 the chord contributes nothing, a = 1 * 1 - 0 = 1 and b = -0 + 0 = 0, so
        // the Hermite term is 0.5 * 0.5 * lerp(0.5, 1, 0) = 0.125.
        expect(at(curve, 0, 0, 0)).toBe(0);
        expect(at(curve, 1, 0, 0)).toBe(0);
        expect(harness(curve).sample(0.5, 0, 0)).toBe(0.125);
    });

    it('nests a spline inside another spline', () => {
        const curve = {
            type: 'minecraft:spline',
            spline: {
                coordinate,
                points: [
                    {
                        location: 0,
                        value: {
                            coordinate: {
                                type: 'minecraft:gradient',
                                axis: 'z',
                                from_coordinate: 0,
                                to_coordinate: 10,
                                from_value: 0,
                                to_value: 10
                            },
                            points: [
                                { location: 0, value: 100 },
                                { location: 10, value: 200 }
                            ]
                        }
                    },
                    { location: 10, value: 0 }
                ]
            }
        };
        expect(at(curve, 0, 0, 0)).toBe(100);
        expect(at(curve, 0, 0, 10)).toBe(200);
    });
});
