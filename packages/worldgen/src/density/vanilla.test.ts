import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../../.test/reportProgress';
import { loadVanillaWorldgenData } from '../../vectors/javaWorldgenData';
import { expectedFloat, VECTOR_POSITIONS, vectors } from '../../vectors/vectors';
import { RandomState } from '../RandomState';
import type { NoiseGeneratorSettings } from '../settings/NoiseGeneratorSettings';
import { DENSITY_FUNCTION_TYPES } from './DensityFunction';
import type { DensityFunctionNode } from './DensityFunction';

const vanilla = loadVanillaWorldgenData();
const SEED = BigInt(vectors.density.seed);

interface DimensionVectors {
    settings: string;
    router: Record<string, number[]>;
    /** The nether and the end carry no aquifers, so every key here is optional. */
    aquifers: Partial<Record<string, number[]>>;
}

const dimensions: DimensionVectors[] = vectors.density.dimensions;

/**
 * These read the pinned Java Edition server jar,
 * which a clean checkout does not have.
 */
describe.skipIf(!vanilla)('the real vanilla worldgen data', { tags: ['real-data'] }, () => {
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
        expect(data.densityFunctionIds.length).toBeGreaterThan(0);
        reportProgress(`Java worldgen data has ${vanilla.densityFunctionCount} density functions.`);
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
        expect(data.noiseIds.length).toBeGreaterThan(0);
        reportProgress(`Java worldgen data has ${vanilla.noiseCount} noises.`);
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
        expect(data.noiseSettingsIds.length).toBeGreaterThan(0);
        reportProgress(`Java worldgen data has ${vanilla.noiseSettingsCount} noise settings.`);
    });

    it('covers the operator types the vanilla data uses', () => {
        const seen = new Set<string>();
        const visited = new Set<object>();
        const isRecord = (value: unknown): value is Record<string, unknown> =>
            typeof value === 'object' && value !== null;
        const walk = (value: unknown): void => {
            if (!isRecord(value)) return;
            if (visited.has(value)) return;
            visited.add(value);
            if (Array.isArray(value)) {
                for (const entry of value) walk(entry);
                return;
            }
            if (typeof value['type'] === 'string') seen.add(value['type']);
            for (const child of Object.values(value)) walk(child);
        };
        for (const id of data.densityFunctionIds) walk(data.densityFunction(id));
        for (const id of data.noiseSettingsIds) walk(data.settings(id));

        const unsupported = [...seen].filter(
            (type) => !DENSITY_FUNCTION_TYPES.some((registered) => registered === type)
        );
        expect(unsupported).toEqual([]);
        reportProgress(
            `Java worldgen data uses ${seen.size} of ${DENSITY_FUNCTION_TYPES.length} registered density function types.`
        );
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
