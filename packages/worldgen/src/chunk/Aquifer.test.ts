import { describe, expect, it, vi } from 'vitest';

import registryVectors from '../../vectors/26.3/surface-registries.json' with { type: 'json' };
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
        const state = new RandomState(vanillaData, 1234n, vanillaData.settings('minecraft:overworld'));
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
