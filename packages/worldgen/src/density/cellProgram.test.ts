import { describe, expect, it } from 'vitest';

import registryVectors from '../../vectors/26.3/surface-registries.json' with { type: 'json' };
import { ChunkSampler } from '../chunk/ChunkSampler';
import { f32 } from '../math';
import type { Noise } from '../noise/GradientNoise';
import { LegacyRandomSource } from '../random/LegacyRandomSource';
import { RandomState } from '../RandomState';
import { WorldgenData } from '../WorldgenData';
import { DensityFunctionCompiler } from './compile';
import type { InterpolationCellSize } from './compile';
import { parseDensityFunction } from './parse';
import { SampleContext } from './SampleContext';

const parseDocuments = (source: Record<string, string>): Map<string, unknown> =>
    new Map(Object.entries(source).map(([id, document]) => [id, JSON.parse(document) as unknown]));

const vanillaData = new WorldgenData({
    densityFunctions: parseDocuments(registryVectors.densityFunctions),
    noises: parseDocuments(registryVectors.noises),
    noiseSettings: parseDocuments(registryVectors.noiseSettings)
});

const floatBits = new Float32Array(1);
const floatWords = new Uint32Array(floatBits.buffer);
/** A float's bits, so +0 and -0 compare as different. */
const bitsOf = (value: number): number => {
    floatBits[0] = value;
    return floatWords[0] ?? 0;
};

/**
 * Fills each cell of a block range through the program and through the per-block closure with the
 * interpolation buffers on, the two ways the terrain cell walk can sample, and reports every
 * position whose bits differ.
 */
const compareCells = (
    sample: (context: SampleContext, x: number, y: number, z: number) => number,
    fill: (context: SampleContext, x0: number, y0: number, z0: number, out: Float64Array) => void,
    size: number,
    cell: InterpolationCellSize,
    origins: readonly (readonly [number, number, number])[]
): string[] => {
    const programContext = new SampleContext();
    const closureContext = new SampleContext();
    programContext.interpolationBuffersEnabled = true;
    closureContext.interpolationBuffersEnabled = true;
    const values = new Float64Array(size);
    const mismatches: string[] = [];
    for (const [x0, y0, z0] of origins) {
        fill(programContext, x0, y0, z0, values);
        for (let localX = 0; localX < cell.xz; localX++) {
            for (let localZ = 0; localZ < cell.xz; localZ++) {
                for (let localY = cell.y - 1; localY >= 0; localY--) {
                    const expected = sample(closureContext, x0 + localX, y0 + localY, z0 + localZ);
                    const actual = values[(localX * cell.xz + localZ) * cell.y + localY] ?? Number.NaN;
                    if (bitsOf(actual) !== bitsOf(expected)) {
                        mismatches.push(`${x0 + localX},${y0 + localY},${z0 + localZ}: ${actual} != ${expected}`);
                    }
                }
            }
        }
    }
    return mismatches;
};

/** Every cell origin of one chunk, top down. */
const chunkCells = (
    chunkX: number,
    chunkZ: number,
    minY: number,
    height: number,
    cell: InterpolationCellSize
): [number, number, number][] => {
    const origins: [number, number, number][] = [];
    for (let x = 0; x < 16; x += cell.xz) {
        for (let z = 0; z < 16; z += cell.xz) {
            for (let y = height - cell.y; y >= 0; y -= cell.y)
                origins.push([chunkX * 16 + x, minY + y, chunkZ * 16 + z]);
        }
    }
    return origins;
};

describe('the cell program', () => {
    for (const settingsId of vanillaData.noiseSettingsIds) {
        it(`gives final_density the terrain walk's bits over a whole chunk of ${settingsId}, running no closure per block`, () => {
            const settings = vanillaData.settings(settingsId);
            const state = new RandomState(vanillaData, 1234n, settings);
            const node = settings.noiseRouter.finalDensity;
            const cell = state.interpolationCellSizeOf(node);
            if (cell === undefined) return;

            const program = state.cellProgram(node, cell);
            const mismatches = compareCells(
                state.sampler(node),
                (context, x0, y0, z0, out) => program.fill(context, x0, y0, z0, out),
                program.size,
                cell,
                chunkCells(3, -5, settings.noiseSettings.minY, settings.noiseSettings.height, cell)
            );

            expect(mismatches.slice(0, 5)).toEqual([]);
            expect(program.fallbackSamples).toBe(0);
        });
    }

    it('fills every cell the chunk walk does not prove empty, and nothing else', () => {
        const state = new RandomState(vanillaData, 1234n, vanillaData.settings('minecraft:overworld'));
        const node = state.settings.noiseRouter.finalDensity;
        const cell = state.interpolationCellSizeOf(node);
        if (cell === undefined) throw new TypeError('the overworld interpolates final_density');
        const program = state.cellProgram(node, cell);
        const before = program.fills;

        const sampler = new ChunkSampler(state, { chunkX: 3, chunkZ: -5 });
        for (let index = 0; index < sampler.cellCount; index++) sampler.forEachCellBlock(index, () => {});

        expect(program.fills - before).toBe(sampler.cellCount - sampler.cellSkipStats.cellsSkipped);
        expect(sampler.cellSkipStats.cellsSkipped).toBeGreaterThan(0);
    });

    describe('against the closures, with each operator at the root so no later node hides a sign', () => {
        // Crosses zero, so `mul` meets zero operands and negative partners, where its constant and
        // dynamic forms disagree on the sign of the result.
        const noise: Noise = {
            get3: (x, y, z) => f32(Math.sin(x * 1.7 + y * 0.3) * Math.cos(z * 0.9) * 2 - 0.25),
            get2: (x, z) => f32(Math.sin(x) * Math.cos(z))
        };
        const leaf = { type: 'minecraft:noise', noise: 'minecraft:test', xz_scale: 0.2, y_scale: 0.15 };
        const nonPositive = { type: 'minecraft:clamp', input: leaf, min: -1, max: 0 };
        const negated = { type: 'minecraft:negate', input: leaf };
        const trees: Record<string, unknown> = {
            'dynamic mul, whose zero left side answers +0': {
                type: 'minecraft:mul',
                left: nonPositive,
                right: negated
            },
            'mul by a constant zero, which keeps the sign': { type: 'minecraft:mul', left: 0, right: negated },
            'add and sub': {
                type: 'minecraft:sub',
                left: { type: 'minecraft:add', left: { type: 'minecraft:abs', input: leaf }, right: 0.5 },
                right: nonPositive
            },
            'min and max': {
                type: 'minecraft:max',
                left: { type: 'minecraft:min', left: leaf, right: negated },
                right: -0.3
            },
            'unary operators': {
                type: 'minecraft:square',
                input: {
                    type: 'minecraft:squeeze',
                    input: {
                        type: 'minecraft:half_negative',
                        input: { type: 'minecraft:quarter_negative', input: leaf }
                    }
                }
            },
            'a range_choice over an interpolated input, with cells on both sides': {
                type: 'minecraft:range_choice',
                input: { type: 'minecraft:interpolated', input: leaf, cell_size_xz: 4, cell_size_y: 8 },
                min_inclusive: -0.2,
                max_exclusive: 0.4,
                when_in_range: { type: 'minecraft:cube', input: leaf },
                when_out_of_range: { type: 'minecraft:div', left: leaf, right: negated }
            }
        };

        for (const [name, json] of Object.entries(trees)) {
            it(name, () => {
                const tree = parseDensityFunction(json, (id) => {
                    throw new RangeError(`unexpected reference ${id}`);
                });
                const compiler = new DensityFunctionCompiler({
                    noise: () => noise,
                    random: () => new LegacyRandomSource(1n),
                    endIslandRandom: () => new LegacyRandomSource(1n)
                });
                const cell = { xz: 4, y: 8 };
                const program = compiler.cellProgram(tree, cell);

                const mismatches = compareCells(
                    compiler.compile(tree),
                    (context, x0, y0, z0, out) => program.fill(context, x0, y0, z0, out),
                    program.size,
                    cell,
                    chunkCells(0, 0, -64, 64, cell)
                );

                expect(mismatches.slice(0, 5)).toEqual([]);
                // Only the noise leaves and the dynamic divide run per position, a whole cell at a time.
                expect(program.fallbackSamples % program.size).toBe(0);
            });
        }
    });
});
