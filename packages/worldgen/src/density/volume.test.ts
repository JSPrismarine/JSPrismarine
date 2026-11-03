import { describe, expect, it } from 'vitest';

import registryVectors from '../../vectors/surface-registries.json' with { type: 'json' };
import { RandomState } from '../RandomState';
import { WorldgenData } from '../WorldgenData';

const parseDocuments = (source: Record<string, string>): Map<string, unknown> =>
    new Map(Object.entries(source).map(([id, document]) => [id, JSON.parse(document) as unknown]));

const data = new WorldgenData({
    densityFunctions: parseDocuments(registryVectors.densityFunctions),
    noises: parseDocuments(registryVectors.noises),
    noiseSettings: parseDocuments(registryVectors.noiseSettings)
});

describe('density volume evaluator', () => {
    it('matches scalar density at negative coordinates and interpolation boundaries', () => {
        const settings = data.settings('minecraft:overworld');
        const state = new RandomState(data, 1234n, settings);
        const node = settings.noiseRouter.finalDensity;
        const volume = {
            minX: -5,
            minY: -9,
            minZ: -5,
            sizeX: 9,
            sizeY: 17,
            sizeZ: 9
        };
        const expected = new Float64Array(volume.sizeX * volume.sizeY * volume.sizeZ);
        const actual = new Float64Array(expected.length);
        const scalar = state.sampler(node);
        const evaluator = state.volumeSampler(node);
        const scalarContext = state.createContext();
        const volumeContext = state.createContext();
        scalarContext.interpolationBuffersEnabled = true;
        volumeContext.interpolationBuffersEnabled = true;

        let index = 0;
        for (let y = volume.minY; y < volume.minY + volume.sizeY; y++) {
            for (let z = volume.minZ; z < volume.minZ + volume.sizeZ; z++) {
                for (let x = volume.minX; x < volume.minX + volume.sizeX; x++) {
                    expected[index++] = scalar(scalarContext, x, y, z);
                }
            }
        }

        evaluator.sample(volumeContext, volume, actual);

        for (let sample = 0; sample < actual.length; sample++) {
            const x = volume.minX + (sample % volume.sizeX);
            const z = volume.minZ + (Math.floor(sample / volume.sizeX) % volume.sizeZ);
            const y = volume.minY + Math.floor(sample / (volume.sizeX * volume.sizeZ));
            expect(actual[sample], `density at ${x},${y},${z}`).toBe(expected[sample]);
        }
        expect(evaluator.scalarFallbackCount).toBeGreaterThan(0);
    });

    it('reuses its workspace and rejects undersized outputs before allocating it', () => {
        const settings = data.settings('minecraft:overworld');
        const state = new RandomState(data, 1234n, settings);
        const evaluator = state.volumeSampler({ type: 'constant', value: 2.5 });
        const context = state.createContext();
        const volume = { minX: 0, minY: 0, minZ: 0, sizeX: 2, sizeY: 3, sizeZ: 2 };

        expect(() => evaluator.sample(context, volume, new Float64Array(11))).toThrow(/needs 12 values/);
        expect(evaluator.workspaceGrowthCount).toBe(0);

        const output = new Float64Array(12);
        evaluator.sample(context, volume, output);
        expect([...output]).toEqual(Array.from({ length: 12 }, () => 2.5));
        expect(evaluator.workspaceGrowthCount).toBe(1);
        expect(evaluator.retainedWorkspaceBytes).toBe(evaluator.instructionCount * output.length * 8);

        evaluator.sample(context, volume, output);
        expect(evaluator.workspaceGrowthCount).toBe(1);
    });
});
