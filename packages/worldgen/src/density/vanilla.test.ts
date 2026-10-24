import { describe, expect, it } from 'vitest';

import { loadVanillaWorldgenData } from '../../vectors/javaWorldgenData';
import { expectedFloat, VECTOR_POSITIONS, vectors } from '../../vectors/vectors';
import { RandomState } from '../RandomState';
import type { NoiseGeneratorSettings } from '../settings/NoiseGeneratorSettings';
import type { DensityFunctionNode } from './DensityFunction';

const vanilla = loadVanillaWorldgenData();
const SEED = BigInt(vectors.density.seed);

interface DimensionVectors {
    settings: string;
    router: Record<string, number[]>;
    aquifers: Record<string, number[]>;
}

const dimensions: DimensionVectors[] = vectors.density.dimensions;

/**
 * These run only with `JSP_WORLDGEN_VANILLA` set, because they read the pinned Java Edition
 * server jar, which a clean checkout does not have.
 */
describe.skipIf(!vanilla)('the real vanilla worldgen data', () => {
    if (!vanilla) return;
    const data = vanilla.data;

    it('parses every density function with no errors', () => {
        const failures: string[] = [];
        for (const id of data.densityFunctionIds) {
            try {
                data.densityFunction(id);
            } catch (error) {
                failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        expect(failures).toEqual([]);
        expect(vanilla.densityFunctionCount).toBe(55);
    });

    it('parses every noise with no errors', () => {
        const failures: string[] = [];
        for (const id of data.noiseIds) {
            try {
                data.noise(id);
            } catch (error) {
                failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        expect(failures).toEqual([]);
        expect(vanilla.noiseCount).toBe(64);
    });

    it('parses every noise settings document with no errors', () => {
        const failures: string[] = [];
        for (const id of data.noiseSettingsIds) {
            try {
                data.settings(id);
            } catch (error) {
                failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        expect(failures).toEqual([]);
        expect(vanilla.noiseSettingsCount).toBe(7);
    });

    it('covers the operator types the vanilla data uses', () => {
        const seen = new Set<string>();
        const visited = new Set<object>();
        const walk = (value: unknown): void => {
            if (!value || typeof value !== 'object') return;
            if (visited.has(value)) return;
            visited.add(value);
            if (Array.isArray(value)) {
                for (const entry of value) walk(entry);
                return;
            }
            const record: Record<string, unknown> = value;
            if (typeof record['type'] === 'string') seen.add(record['type']);
            for (const child of Object.values(record)) walk(child);
        };
        for (const id of data.densityFunctionIds) walk(data.densityFunction(id));
        for (const id of data.noiseSettingsIds) walk(data.settings(id));

        // The 26.3 vanilla data reaches 34 of the 44 registered types, counting the bare
        // numbers the parser turns into constants. The other 10 are available to data packs
        // but unused by Mojang's own files.
        expect([...seen].sort()).toEqual([
            'abs',
            'add',
            'beardifier',
            'blend_alpha',
            'blend_density',
            'blend_offset',
            'cache',
            'clamp',
            'constant',
            'cube',
            'distance_to_point',
            'div',
            'end_outer_islands',
            'find_top_surface',
            'gradient',
            'half_negative',
            'interpolated',
            'interval_select',
            'lerp',
            'max',
            'min',
            'mul',
            'negate',
            'noise',
            'old_blended_noise',
            'quarter_negative',
            'range_choice',
            'shift_a',
            'shift_b',
            'slice',
            'spline',
            'square',
            'squeeze',
            'sub'
        ]);
    });

    describe.each(dimensions)('$settings', (dimension) => {
        const settings: NoiseGeneratorSettings = data.settings(dimension.settings);
        const state = new RandomState(data, SEED, settings);

        const check = (name: string, node: DensityFunctionNode, expected: number[]): void => {
            const actual = VECTOR_POSITIONS.map(([x, y, z]) => state.sampleUncached(node, x, y, z));
            expect({ name, actual }).toEqual({ name, actual: expected.map(expectedFloat) });
        };

        it('matches Java for every noise router slot', () => {
            const router = settings.noiseRouter;
            check('temperature', router.temperature, dimension.router['temperature'] ?? []);
            check('vegetation', router.vegetation, dimension.router['vegetation'] ?? []);
            check('continents', router.continents, dimension.router['continents'] ?? []);
            check('erosion', router.erosion, dimension.router['erosion'] ?? []);
            check('depth', router.depth, dimension.router['depth'] ?? []);
            check('ridges', router.ridges, dimension.router['ridges'] ?? []);
            check('chunk_surface_level', router.chunkSurfaceLevel, dimension.router['chunk_surface_level'] ?? []);
            check('final_density', router.finalDensity, dimension.router['final_density'] ?? []);
        });

        it('matches Java for every aquifer function', () => {
            const aquifers = settings.aquifers;
            if (!aquifers) {
                expect(Object.keys(dimension.aquifers)).toEqual([]);
                return;
            }
            check('barrier', aquifers.barrierNoise, dimension.aquifers['barrier'] ?? []);
            check(
                'fluid_level_floodedness',
                aquifers.fluidLevelFloodednessNoise,
                dimension.aquifers['fluid_level_floodedness'] ?? []
            );
            check('fluid_level_spread', aquifers.fluidLevelSpreadNoise, dimension.aquifers['fluid_level_spread'] ?? []);
            check('lava', aquifers.lavaNoise, dimension.aquifers['lava'] ?? []);
            check('exclusion', aquifers.exclusion, dimension.aquifers['exclusion'] ?? []);
            check('surface_level', aquifers.surfaceLevel, dimension.aquifers['surface_level'] ?? []);
        });

        it('gives the same samples for the same seed across runs', () => {
            const second = new RandomState(data, SEED, settings);
            for (const [x, y, z] of VECTOR_POSITIONS) {
                expect(second.sampleUncached(settings.noiseRouter.finalDensity, x, y, z)).toBe(
                    state.sampleUncached(settings.noiseRouter.finalDensity, x, y, z)
                );
            }
        });

        it('gives different samples for a different seed', () => {
            const other = new RandomState(data, SEED + 1n, settings);
            const differences = VECTOR_POSITIONS.filter(
                ([x, y, z]) =>
                    other.sampleUncached(settings.noiseRouter.finalDensity, x, y, z) !==
                    state.sampleUncached(settings.noiseRouter.finalDensity, x, y, z)
            );
            expect(differences.length).toBeGreaterThan(0);
        });
    });
});
