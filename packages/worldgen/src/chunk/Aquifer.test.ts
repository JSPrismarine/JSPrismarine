import { describe, expect, it, vi } from 'vitest';

import registryVectors from '../../vectors/26.3/surface-registries.json' with { type: 'json' };
import { nativeWorldgen } from '../noise/nativeNoise';
import { RandomState } from '../RandomState';
import { WorldgenData } from '../WorldgenData';
import { NoiseBasedAquifer } from './Aquifer';
import { ChunkSampler } from './ChunkSampler';

const parseDocuments = (source: Record<string, string>): Map<string, unknown> =>
    new Map(Object.entries(source).map(([id, document]) => [id, JSON.parse(document) as unknown]));

const vanillaData = new WorldgenData({
    densityFunctions: parseDocuments(registryVectors.densityFunctions),
    noises: parseDocuments(registryVectors.noises),
    noiseSettings: parseDocuments(registryVectors.noiseSettings)
});

describe('the noise aquifer', () => {
    it("looks a block's twelve neighboring cells up once per anchor, not once per block", () => {
        // The TypeScript aquifer, which the cell walk runs where the native library does not load.
        const state = new RandomState(vanillaData, 1234n, vanillaData.settings('minecraft:overworld'), {
            nativeNoise: false
        });
        const substance = vi.spyOn(NoiseBasedAquifer.prototype, 'computeSubstance');
        // getIndex is private; this cast names the one method the test counts.
        const lookups = vi.spyOn(
            NoiseBasedAquifer.prototype as unknown as { getIndex(x: number, y: number, z: number): number },
            'getIndex'
        );
        for (let chunkX = 0; chunkX < 2; chunkX++) {
            for (let chunkZ = 0; chunkZ < 2; chunkZ++) {
                const sampler = new ChunkSampler(state, { chunkX, chunkZ });
                for (let index = 0; index < sampler.cellCount; index++) sampler.forEachCellBlock(index, () => {});
            }
        }
        const reachingCells = substance.mock.calls.filter(([, , , density]) => density <= 0).length;
        const counted = lookups.mock.calls.length;
        vi.restoreAllMocks();

        // Twelve lookups for every block that reached the cell scan before. One anchor's cells now
        // serve every block of its neighborhood, so it is under two per block here; a quarter of
        // the old count is the bound, which a lookup per block would break.
        expect(reachingCells).toBeGreaterThan(1000);
        expect(counted).toBeLessThan(3 * reachingCells);
    });
});

describe.runIf(process.env.JSP_NATIVE_WORLDGEN_REQUIRE === '1' || nativeWorldgen() !== undefined)(
    'the noise aquifer in the native library',
    () => {
        /** Every block the cell walk visits, as `x,y,z state tick`, in visit order. */
        const walk = (sampler: ChunkSampler): string[] => {
            const blocks: string[] = [];
            for (let cell = 0; cell < sampler.cellCount; cell++) {
                sampler.forEachCellBlock(cell, (x, y, z, state, tick) =>
                    blocks.push(`${x},${y},${z} ${state} ${tick}`)
                );
            }
            return blocks;
        };

        const withAquifers = vanillaData.noiseSettingsIds.filter(
            (id) => vanillaData.settings(id).aquifers !== undefined
        );

        it.each(withAquifers)("decides every filled cell of %s with the TypeScript aquifer's answers", (settingsId) => {
            const settings = vanillaData.settings(settingsId);
            const native = new RandomState(vanillaData, 1234n, settings);
            const typescript = new RandomState(vanillaData, 1234n, settings, { nativeNoise: false });
            const seen = new Set<string>();
            let ticks = 0;
            // Overworld chunks of this seed that hold aquifer water, lava from the cell search and
            // fluid ticks; the other settings share the overworld's layout near the origin.
            for (const [chunkX, chunkZ] of [
                [-6, 2],
                [-2, 6],
                [3, 5],
                [4, 3]
            ] as const) {
                const nativeSampler = new ChunkSampler(native, { chunkX, chunkZ });
                const expected = walk(new ChunkSampler(typescript, { chunkX, chunkZ }));
                const actual = walk(nativeSampler);
                const mismatches = actual.filter((block, index) => block !== expected[index]);
                expect(mismatches.slice(0, 5)).toEqual([]);
                expect(actual.length).toBe(expected.length);
                expect(nativeSampler.nativeAquiferCellCount).toBe(
                    nativeSampler.cellCount - nativeSampler.cellSkipStats.cellsSkipped
                );
                for (const block of actual) {
                    seen.add(block.split(' ')[1]!);
                    if (block.endsWith(' true')) ticks++;
                }
            }
            // The chunks hold the cases the aquifer decides between, so the comparison covers them.
            expect([...seen]).toEqual(expect.arrayContaining(['minecraft:water', 'minecraft:lava', 'minecraft:air']));
            expect(ticks).toBeGreaterThan(0);
        });
    }
);
