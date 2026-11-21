import { describe, expect, it, vi } from 'vitest';

import registryVectors from '../../vectors/26.3/surface-registries.json' with { type: 'json' };
import { ChunkSampler } from '../chunk/ChunkSampler';
import { RandomState } from '../RandomState';
import { WorldgenData } from '../WorldgenData';
import { LegacyRandomSource } from '../random/LegacyRandomSource';
import { createBlendedNoiseSampler } from './BlendedNoise';
import type { BlendedNoiseParameters } from './BlendedNoise';
import { nativeWorldgen, NativeStackNoise, withNativeStack } from './nativeNoise';
import { PerlinNoise } from './PerlinNoise';
import { SmearedPerlinNoise } from './SmearedPerlinNoise';

const parseDocuments = (source: Record<string, string>): Map<string, unknown> =>
    new Map(Object.entries(source).map(([id, document]) => [id, JSON.parse(document) as unknown]));

const vanillaData = new WorldgenData({
    densityFunctions: parseDocuments(registryVectors.densityFunctions),
    noises: parseDocuments(registryVectors.noises),
    noiseSettings: parseDocuments(registryVectors.noiseSettings)
});
const settings = vanillaData.settings('minecraft:overworld');

/** Whether the library loads here. `JSP_NATIVE_WORLDGEN_REQUIRE=1` makes a missing build fail. */
const available = process.env.JSP_NATIVE_WORLDGEN_REQUIRE === '1' || nativeWorldgen() !== undefined;

/** Spread positions over ±30,000 blocks, the same ones every run. */
const positions = (count: number): number[] => {
    const xyz: number[] = [];
    let state = 7;
    for (let index = 0; index < count * 3; index++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        xyz.push((state / 4294967296 - 0.5) * 60_000);
    }
    return xyz;
};

const floatBits = new Float32Array(1);
const floatWords = new Uint32Array(floatBits.buffer);
/** A float's bits, so +0 and -0 compare as different. */
const bitsOf = (value: number): number => {
    floatBits[0] = value;
    return floatWords[0] ?? 0;
};

describe.runIf(available)('worldgen noise in the native library', () => {
    const native = new RandomState(vanillaData, 1234n, settings);
    const typescript = new RandomState(vanillaData, 1234n, settings, { nativeNoise: false });
    const noiseIds = Object.keys(registryVectors.noises);

    it('runs every hashed worldgen/noise entry natively, with the same bits as TypeScript', () => {
        const xyz = positions(500);
        const mismatches: string[] = [];
        const nativeIds: string[] = [];
        for (const id of noiseIds) {
            const fast = native.noise(id);
            const reference = typescript.noise(id);
            if (fast instanceof NativeStackNoise) nativeIds.push(id);
            for (let index = 0; index < xyz.length; index += 3) {
                const [x, y, z] = [xyz[index] ?? 0, xyz[index + 1] ?? 0, xyz[index + 2] ?? 0];
                if (bitsOf(fast.get3(x, y, z)) !== bitsOf(reference.get3(x, y, z))) {
                    mismatches.push(`${id} at ${x},${y},${z}`);
                }
            }
        }

        expect(mismatches.slice(0, 5)).toEqual([]);
        // Only the two nether noises Java still builds through the pre-1.18 chain stay in TypeScript.
        expect(noiseIds.filter((id) => !nativeIds.includes(id)).sort()).toEqual([
            'minecraft:nether/temperature',
            'minecraft:nether/vegetation'
        ]);
    });

    it('matches TypeScript at NaN, infinite and far-out coordinates too', () => {
        const odd = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 3e12, -3e12, 2 ** 40 + 0.5];
        const mismatches: string[] = [];
        for (const id of ['minecraft:continentalness', 'minecraft:cave_cheese']) {
            const fast = native.noise(id);
            const reference = typescript.noise(id);
            for (const value of odd) {
                const [a, b] = [fast.get3(value, 0.5, -value), reference.get3(value, 0.5, -value)];
                if (!Object.is(a, b) && bitsOf(a) !== bitsOf(b)) mismatches.push(`${id} at ${value}: ${a} != ${b}`);
            }
        }
        expect(mismatches).toEqual([]);
    });

    it("samples old blended noise's smeared stacks natively, with the same bits", () => {
        const library = nativeWorldgen();
        if (library === undefined) throw new TypeError('the suite runs only where the library loads');
        // The three vanilla base_3d_noise shapes: overworld, nether and end.
        const shapes: BlendedNoiseParameters[] = [
            { xzScale: 0.25, yScale: 0.125, xzFactor: 80, yFactor: 160, smearScaleMultiplier: 8 },
            { xzScale: 0.25, yScale: 0.375, xzFactor: 80, yFactor: 60, smearScaleMultiplier: 8 },
            { xzScale: 0.25, yScale: 0.25, xzFactor: 80, yFactor: 160, smearScaleMultiplier: 4 }
        ];
        const xyz = positions(500);
        const mismatches: string[] = [];
        for (const shape of shapes) {
            const reference = createBlendedNoiseSampler(new LegacyRandomSource(1234n), shape);
            const fast = createBlendedNoiseSampler(new LegacyRandomSource(1234n), shape, (stack) =>
                withNativeStack(library, stack)
            );
            for (let index = 0; index < xyz.length; index += 3) {
                // Terrain samples y inside the world's height, where smearing snaps the lattice.
                const [x, y, z] = [xyz[index] ?? 0, ((xyz[index + 1] ?? 0) % 384) - 64, xyz[index + 2] ?? 0];
                if (bitsOf(fast(x, y, z)) !== bitsOf(reference(x, y, z))) {
                    mismatches.push(`${JSON.stringify(shape)} at ${x},${y},${z}`);
                }
            }
        }

        expect(mismatches.slice(0, 5)).toEqual([]);
    });

    it('samples a native noise without running a TypeScript octave', () => {
        const noise = native.noise('minecraft:continentalness');
        const octaves = vi.spyOn(PerlinNoise.prototype, 'get3');
        for (let x = 0; x < 100; x++) noise.get3(x * 13.7, 64, x * -9.1);
        const counted = octaves.mock.calls.length;
        octaves.mockRestore();

        expect(counted).toBe(0);
    });

    it("fills a chunk's terrain without one TypeScript octave sample, where the TypeScript path runs tens of thousands", () => {
        const octaveSamples = (state: RandomState): number => {
            // Smeared octaves override get3, so each class is counted on its own.
            const octaves = vi.spyOn(PerlinNoise.prototype, 'get3');
            const smeared = vi.spyOn(SmearedPerlinNoise.prototype, 'get3');
            const sampler = new ChunkSampler(state, { chunkX: 3, chunkZ: -5 });
            for (let index = 0; index < sampler.cellCount; index++) sampler.forEachCellBlock(index, () => {});
            const counted = octaves.mock.calls.length + smeared.mock.calls.length;
            vi.restoreAllMocks();
            return counted;
        };

        expect(octaveSamples(new RandomState(vanillaData, 1234n, settings))).toBe(0);
        expect(octaveSamples(new RandomState(vanillaData, 1234n, settings, { nativeNoise: false }))).toBeGreaterThan(
            10_000
        );
    });
});

describe('the TypeScript noise path', () => {
    it('keeps every noise in TypeScript when native noise is off', () => {
        const state = new RandomState(vanillaData, 1234n, settings, { nativeNoise: false });
        expect(Object.keys(registryVectors.noises).some((id) => state.noise(id) instanceof NativeStackNoise)).toBe(
            false
        );
    });
});
