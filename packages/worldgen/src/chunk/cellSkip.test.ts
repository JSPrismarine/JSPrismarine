import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import registryVectors from '../../vectors/surface-registries.json' with { type: 'json' };
import { RandomState } from '../RandomState';
import { SampleContext } from '../density/SampleContext';
import { WorldgenData } from '../WorldgenData';
import { ChunkSampler } from './ChunkSampler';
import { FluidStatus, WATER } from './FluidPicker';

const parseDocuments = (source: Record<string, string>): Map<string, unknown> =>
    new Map(Object.entries(source).map(([id, document]) => [id, JSON.parse(document) as unknown]));

const data = new WorldgenData({
    densityFunctions: parseDocuments(registryVectors.densityFunctions),
    noises: parseDocuments(registryVectors.noises),
    noiseSettings: parseDocuments(registryVectors.noiseSettings)
});

const globalWaterData = (): WorldgenData =>
    new WorldgenData({
        densityFunctions: new Map(),
        noises: new Map(),
        noiseSettings: new Map([
            [
                'test:global_water',
                {
                    noise: { min_y: 0, height: 16 },
                    default_block: 'minecraft:stone',
                    default_fluid: WATER,
                    noise_router: {
                        temperature: 0,
                        vegetation: 0,
                        continents: 0,
                        erosion: 0,
                        depth: 0,
                        ridges: 0,
                        chunk_surface_level: 0,
                        final_density: {
                            type: 'minecraft:add',
                            left: {
                                type: 'minecraft:min',
                                left: {
                                    type: 'minecraft:squeeze',
                                    input: {
                                        type: 'minecraft:interpolated',
                                        cell_size_xz: 4,
                                        cell_size_y: 8,
                                        input: -0.5
                                    }
                                },
                                right: 1
                            },
                            right: { type: 'minecraft:beardifier' }
                        }
                    },
                    material_rule: 'test:surface',
                    sea_level: 16,
                    disable_mob_generation: true,
                    legacy_random_source: true
                }
            ]
        ])
    });

const digestCellWalk = (sampler: ChunkSampler): string => {
    const hash = createHash('sha256');
    for (let cell = 0; cell < sampler.cellCount; cell++) {
        sampler.forEachCellBlock(cell, (x, y, z, state, scheduleFluidUpdate) => {
            hash.update(`${x},${y},${z}|${state}|${scheduleFluidUpdate ? 1 : 0}\n`);
        });
    }
    return hash.digest('hex');
};

describe('proven interpolation cell skips', () => {
    it('matches scalar states and fluid flags for cells above the aquifer cutoff', () => {
        const settings = data.settings('minecraft:overworld');
        const optimized = new ChunkSampler(new RandomState(data, 1234n, settings), {
            chunkX: 3,
            chunkZ: -5,
            verifySkippedCells: true
        });
        const scalar = new ChunkSampler(new RandomState(data, 1234n, settings), {
            chunkX: 3,
            chunkZ: -5,
            skipProvenCells: false
        });

        expect(digestCellWalk(optimized)).toBe(digestCellWalk(scalar));
        expect(optimized.cellSkipStats.cellsSkipped).toBeGreaterThan(0);
        expect(optimized.cellSkipStats.blocksSkipped).toBe(optimized.cellSkipStats.densityCallsSkipped);
        expect(optimized.cellSkipStats.blocksSkipped).toBe(optimized.cellSkipStats.aquiferCallsSkipped);
    });

    it('keeps the corpus terrain chunk unchanged at its recorded seed and coordinates', () => {
        const settings = data.settings('minecraft:overworld');
        const optimized = new ChunkSampler(new RandomState(data, 987654321n, settings), {
            chunkX: 12,
            chunkZ: -37,
            verifySkippedCells: true
        });
        const scalar = new ChunkSampler(new RandomState(data, 987654321n, settings), {
            chunkX: 12,
            chunkZ: -37,
            skipProvenCells: false
        });

        expect(digestCellWalk(optimized)).toBe(digestCellWalk(scalar));
        expect(optimized.cellSkipStats.cellsSkipped).toBeGreaterThan(0);
    });

    it('uses the global water result when aquifers are disabled', () => {
        const worldgen = globalWaterData();
        const settings = worldgen.settings('test:global_water');
        const sampler = new ChunkSampler(new RandomState(worldgen, 1234n, settings), {
            chunkX: 0,
            chunkZ: 0,
            verifySkippedCells: true
        });
        const states = new Set<string>();

        sampler.forEachCellBlock(0, (_x, _y, _z, state, scheduleFluidUpdate) => {
            states.add(state);
            expect(scheduleFluidUpdate).toBe(false);
        });

        expect(sampler.cellSkipStats.cellsSkipped).toBeGreaterThan(0);
        expect(states).toEqual(new Set([WATER]));
    });

    it('keeps custom fluid pickers on the scalar path', () => {
        const settings = data.settings('minecraft:overworld');
        const sampler = new ChunkSampler(new RandomState(data, 1234n, settings), {
            chunkX: 3,
            chunkZ: -5,
            fluidPicker: () => new FluidStatus(400, WATER)
        });

        sampler.forEachCellBlock(0, () => {});

        expect(sampler.cellSkipStats.cellsSkipped).toBe(0);
    });

    it('keeps cells below the aquifer cutoff on the scalar path', () => {
        const settings = data.settings('minecraft:overworld');
        const sampler = new ChunkSampler(new RandomState(data, 1234n, settings), {
            chunkX: 3,
            chunkZ: -5
        });

        sampler.forEachCellBlock(sampler.cellCount - 1, () => {});

        expect(sampler.cellSkipStats.cellsSkipped).toBe(0);
    });

    it('keeps cells on the scalar path when a runtime beardifier is installed', () => {
        const settings = data.settings('minecraft:overworld');
        const context = new SampleContext();
        context.beardifier = () => 0;
        const sampler = new ChunkSampler(new RandomState(data, 1234n, settings), {
            chunkX: 3,
            chunkZ: -5,
            context
        });

        sampler.forEachCellBlock(0, () => {});

        expect(sampler.cellSkipStats.cellsSkipped).toBe(0);
    });
});
