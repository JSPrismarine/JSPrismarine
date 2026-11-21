import { describe, expect, it, vi } from 'vitest';

import registryVectors from '../../vectors/26.3/surface-registries.json' with { type: 'json' };
import { createClimateSampler } from '../biome/ClimateSampler';
import { ChunkSampler } from '../chunk/ChunkSampler';
import { nativeWorldgen, NativeStackNoise } from '../noise/nativeNoise';
import { RandomState } from '../RandomState';
import { WorldgenData } from '../WorldgenData';
import type { DensityFunctionNode } from './DensityFunction';
import { densityInputsOf } from './DensityFunction';
import { parseDensityFunction } from './parse';

const parseDocuments = (source: Record<string, string>): Map<string, unknown> =>
    new Map(Object.entries(source).map(([id, document]) => [id, JSON.parse(document) as unknown]));

const vanillaData = new WorldgenData({
    densityFunctions: parseDocuments(registryVectors.densityFunctions),
    noises: parseDocuments(registryVectors.noises),
    noiseSettings: parseDocuments(registryVectors.noiseSettings)
});

/** Whether the library loads here. `JSP_NATIVE_WORLDGEN_REQUIRE=1` makes a missing build fail. */
const available = process.env.JSP_NATIVE_WORLDGEN_REQUIRE === '1' || nativeWorldgen() !== undefined;

const floatBits = new Float32Array(1);
const floatWords = new Uint32Array(floatBits.buffer);
/** A float's bits, so +0 and -0 compare as different; every NaN compares the same. */
const bitsOf = (value: number): number => {
    if (Number.isNaN(value)) return -1;
    floatBits[0] = value;
    return floatWords[0] ?? 0;
};

/** The node types the native interpreter has no operation for. */
const TYPESCRIPT_ONLY = new Set(['end_outer_islands', 'pow', 'log', 'interpolated']);

/** The two nether noises Java builds through the pre-1.18 octave chain, which have no kernel. */
const LEGACY_NOISES = new Set(['minecraft:nether/temperature', 'minecraft:nether/vegetation']);

/** Whether a tree reaches a node the native interpreter has no operation for, or a legacy noise. */
const reachesTypeScriptOnly = (root: DensityFunctionNode): boolean => {
    const seen = new Set<DensityFunctionNode>();
    const walk = (node: DensityFunctionNode): boolean => {
        if (seen.has(node)) return false;
        seen.add(node);
        if (TYPESCRIPT_ONLY.has(node.type)) return true;
        if (node.type === 'noise' && LEGACY_NOISES.has(node.noise)) return true;
        return densityInputsOf(node).some(walk);
    };
    return walk(root);
};

/** Every `interpolated` node a tree reaches. */
const interpolatedNodes = (root: DensityFunctionNode): DensityFunctionNode[] => {
    const found = new Set<DensityFunctionNode>();
    const seen = new Set<DensityFunctionNode>();
    const walk = (node: DensityFunctionNode): void => {
        if (seen.has(node)) return;
        seen.add(node);
        if (node.type === 'interpolated') found.add(node);
        for (const input of densityInputsOf(node)) walk(input);
    };
    walk(root);
    return [...found];
};

/** Positions spread over ±3,000 blocks and the world's height, integral as block positions are. */
const positions = (count: number, minY: number, height: number): [number, number, number][] => {
    const out: [number, number, number][] = [];
    let state = 11;
    const next = (): number => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
    for (let index = 0; index < count; index++) {
        out.push([
            Math.floor((next() - 0.5) * 6000),
            minY + Math.floor(next() * height),
            Math.floor((next() - 0.5) * 6000)
        ]);
    }
    return out;
};

/** The positions where the native evaluator and the closure disagree, as text. */
const compare = (state: RandomState, node: DensityFunctionNode, at: readonly [number, number, number][]): string[] => {
    const native = state.nativeSampler(node);
    if (native === undefined) return [`${node.type} has no native program`];
    const closure = state.sampler(node);
    const context = state.createContext();
    const mismatches: string[] = [];
    for (const [x, y, z] of at) {
        const expected = closure(context, x, y, z);
        const actual = native(x, y, z);
        if (bitsOf(actual) !== bitsOf(expected))
            mismatches.push(`${node.type} at ${x},${y},${z}: ${actual} != ${expected}`);
    }
    return mismatches;
};

describe.runIf(available)('density programs in the native library', () => {
    for (const settingsId of vanillaData.noiseSettingsIds) {
        it(`runs every interpolated tree of ${settingsId} with the closures' bits`, () => {
            const settings = vanillaData.settings(settingsId);
            const state = new RandomState(vanillaData, 1234n, settings);
            const at = positions(400, settings.noiseSettings.minY, settings.noiseSettings.height);
            const trees = Object.values(settings.noiseRouter)
                .flatMap(interpolatedNodes)
                .flatMap((node) => (node.type === 'interpolated' ? [node.input] : []));
            const native = trees.filter((tree) => !reachesTypeScriptOnly(tree));

            expect(native.flatMap((tree) => compare(state, tree, at)).slice(0, 5)).toEqual([]);
            // A tree with a TypeScript-only node keeps its closures rather than half a program.
            for (const tree of trees.filter(reachesTypeScriptOnly)) expect(state.nativeSampler(tree)).toBeUndefined();
        });
    }

    for (const settingsId of vanillaData.noiseSettingsIds) {
        it(`runs every router and aquifer tree of ${settingsId} that has no TypeScript-only node with the closures' bits`, () => {
            const settings = vanillaData.settings(settingsId);
            const state = new RandomState(vanillaData, 1234n, settings);
            const at = positions(200, settings.noiseSettings.minY, settings.noiseSettings.height);
            const trees = [...Object.values(settings.noiseRouter), ...Object.values(settings.aquifers ?? {})];

            expect(
                trees
                    .filter((tree) => !reachesTypeScriptOnly(tree))
                    .flatMap((tree) => compare(state, tree, at))
                    .slice(0, 5)
            ).toEqual([]);
            for (const tree of trees.filter(reachesTypeScriptOnly)) expect(state.nativeSampler(tree)).toBeUndefined();
        });
    }

    describe('against the closures, one tree per operation', () => {
        const state = new RandomState(vanillaData, 1234n, vanillaData.settings('minecraft:overworld'));
        const noise = { type: 'minecraft:noise', noise: 'minecraft:ridge', xz_scale: 0.25, y_scale: 0.5 };
        const shifted = {
            type: 'minecraft:noise',
            noise: 'minecraft:jagged',
            xz_scale: 1,
            y_scale: 0,
            shift_x: { type: 'minecraft:shift_a', argument: 'minecraft:offset', noise: 'minecraft:offset' },
            shift_y: { type: 'minecraft:shift', argument: 'minecraft:offset', noise: 'minecraft:offset' },
            shift_z: { type: 'minecraft:shift_b', argument: 'minecraft:offset', noise: 'minecraft:offset' }
        };
        const gradient = (tiling: string, axis: string) => ({
            type: 'minecraft:gradient',
            axis,
            tiling,
            from_coordinate: -64,
            to_coordinate: 320,
            from_value: 1.5,
            to_value: -1.5
        });
        const trees: Record<string, unknown> = {
            'gradients, each tiling along each axis': {
                type: 'minecraft:add',
                left: { type: 'minecraft:add', left: gradient('clamp_to_edge', 'y'), right: gradient('repeat', 'x') },
                right: gradient('mirrored_repeat', 'z')
            },
            'shifted noise and the three shifts': shifted,
            'unary operators': {
                type: 'minecraft:add',
                left: { type: 'minecraft:sqrt', input: { type: 'minecraft:abs', input: noise } },
                right: {
                    type: 'minecraft:add',
                    left: { type: 'minecraft:reciprocal', input: { type: 'minecraft:add', left: noise, right: 3 } },
                    right: { type: 'minecraft:sign', input: { type: 'minecraft:squeeze', input: noise } }
                }
            },
            'dynamic and constant binary forms': {
                type: 'minecraft:max',
                left: { type: 'minecraft:div', left: noise, right: { type: 'minecraft:add', left: noise, right: 2 } },
                right: {
                    type: 'minecraft:min',
                    left: { type: 'minecraft:sub', left: 0.25, right: noise },
                    right: {
                        type: 'minecraft:sub',
                        left: {
                            type: 'minecraft:div',
                            left: 3,
                            right: { type: 'minecraft:add', left: noise, right: 2 }
                        },
                        right: { type: 'minecraft:div', left: noise, right: 7 }
                    }
                }
            },
            'rounding to an integer and to a multiple': {
                type: 'minecraft:add',
                left: { type: 'minecraft:round', input: { type: 'minecraft:mul', left: noise, right: 9 }, multiple: 1 },
                right: {
                    type: 'minecraft:truncate',
                    input: { type: 'minecraft:mul', left: noise, right: 9 },
                    multiple: 0.5
                }
            },
            'lerp, range choice and interval select': {
                type: 'minecraft:lerp',
                alpha: { type: 'minecraft:clamp', input: noise, min: 0, max: 1 },
                first: {
                    type: 'minecraft:range_choice',
                    input: noise,
                    min_inclusive: -0.1,
                    max_exclusive: 0.2,
                    when_in_range: gradient('clamp_to_edge', 'y'),
                    when_out_of_range: { type: 'minecraft:cube', input: noise }
                },
                second: {
                    type: 'minecraft:interval_select',
                    input: noise,
                    thresholds: [-0.3, 0, 0.3],
                    functions: [-1, gradient('repeat', 'x'), noise, 1]
                }
            },
            'slices and distances': {
                type: 'minecraft:add',
                left: { type: 'minecraft:slice', axis: 'y', coordinate: 7, input: noise },
                right: {
                    type: 'minecraft:add',
                    left: { type: 'minecraft:distance_to_point', point: [10, 64, -20], metric: 'euclidean' },
                    right: { type: 'minecraft:distance_to_point', point: [0, 0, 0], metric: 'chebyshev' }
                }
            },
            'caches by position and by column': {
                type: 'minecraft:add',
                left: { type: 'minecraft:cache', input: noise },
                right: {
                    type: 'minecraft:cache',
                    input: { type: 'minecraft:slice', axis: 'y', coordinate: 0, input: noise }
                }
            },
            'the top surface search': {
                type: 'minecraft:find_top_surface',
                density: { type: 'minecraft:add', left: noise, right: gradient('clamp_to_edge', 'y') },
                upper_bound: 200,
                lower_bound: -64,
                cell_height: 8
            },
            'the hooks, neutral where no structure or blending is in play': {
                type: 'minecraft:blend_density',
                input: {
                    type: 'minecraft:add',
                    left: { type: 'minecraft:mul', left: { type: 'minecraft:blend_alpha' }, right: noise },
                    right: {
                        type: 'minecraft:add',
                        left: { type: 'minecraft:blend_offset' },
                        right: { type: 'minecraft:beardifier' }
                    }
                }
            },
            'old blended noise': {
                type: 'minecraft:old_blended_noise',
                xz_scale: 0.25,
                y_scale: 0.125,
                xz_factor: 80,
                y_factor: 160,
                smear_scale_multiplier: 8
            }
        };

        for (const [name, json] of Object.entries(trees)) {
            it(name, () => {
                const tree = parseDensityFunction(json, (id) => vanillaData.densityFunction(id));
                expect(compare(state, tree, positions(500, -64, 384)).slice(0, 5)).toEqual([]);
            });
        }
    });

    // The aquifer's trees run natively too, so a setting with an aquifer makes none either.
    for (const settingsId of ['minecraft:overworld', 'minecraft:nether', 'minecraft:caves']) {
        it(`fills a chunk of ${settingsId} without one noise sample from TypeScript`, () => {
            const state = new RandomState(vanillaData, 1234n, vanillaData.settings(settingsId));
            const noise = vi.spyOn(NativeStackNoise.prototype, 'get3');
            const sampler = new ChunkSampler(state, { chunkX: 3, chunkZ: -5 });
            for (let index = 0; index < sampler.cellCount; index++) sampler.forEachCellBlock(index, () => {});
            const counted = noise.mock.calls.length;
            noise.mockRestore();

            expect(counted).toBe(0);
        });
    }

    it('samples the climate without one noise sample from TypeScript', () => {
        const state = new RandomState(vanillaData, 1234n, vanillaData.settings('minecraft:overworld'));
        const noise = vi.spyOn(NativeStackNoise.prototype, 'get3');
        const climate = createClimateSampler(state);
        for (let quartX = 0; quartX < 4; quartX++) {
            for (let quartZ = 0; quartZ < 4; quartZ++) {
                for (let quartY = -16; quartY < 80; quartY++) climate.sample(12 + quartX, quartY, quartZ - 20);
            }
        }
        const counted = noise.mock.calls.length;
        noise.mockRestore();

        expect(counted).toBe(0);
    });
});
