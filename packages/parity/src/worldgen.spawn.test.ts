import { DataDrivenGenerator } from '@jsprismarine/prismarine/world/generators/datadriven/DataDrivenGenerator';
import { findNoiseSpawnPosition, RandomState, WorldgenData } from '@jsprismarine/worldgen';
import type { DensityFunctionNode } from '@jsprismarine/worldgen';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { loadJavaSpawnPositions } from './goldens.ts';
import { openGeneration } from './generation/capture.ts';
import { describeFamily } from './measure.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';

/** The seeds include deep-ocean origins as well as a seed whose Java result remains at origin. */
const vectors = loadJavaSpawnPositions();
const environment = openGeneration();

describeFamily(FAMILIES.worldgenSpawn, [REFERENCES.javaWorldgenData, REFERENCES.worldgenSpawnPositions], () => {
    const generator = new DataDrivenGenerator({
        registries: environment!.registries,
        structures: false,
        decorate: false
    });
    const worldgen = new WorldgenData({
        densityFunctions: environment!.registries.densityFunctions,
        noises: environment!.registries.noises,
        noiseSettings: environment!.registries.noiseSettings
    });
    const settings = worldgen.settings(vectors.settings);
    const actual = vectors.positions.map(({ seed }) => {
        const worldSeed = BigInt(seed);
        const selected = generator.spawnChunk(worldSeed);
        const state = new RandomState(worldgen, worldSeed, settings);
        const context = state.createContext();
        const samplers = new Map<DensityFunctionNode, ReturnType<RandomState['sampler']>>();
        // DataDrivenGenerator returns only the containing chunk. Run the shared finder here to
        // compare its exact block result with Java's fixture without widening the production API.
        const position = findNoiseSpawnPosition(settings.spawnTargets, (node, x, y, z) => {
            let sampler = samplers.get(node);
            if (sampler === undefined) {
                sampler = state.sampler(node);
                samplers.set(node, sampler);
            }
            return sampler(context, x, y, z);
        });

        return {
            seed,
            chunk: [selected.chunkX, selected.chunkZ],
            block: [position.x, position.y, position.z],
            candidates: selected.candidates
        };
    });
    const gaps = vectors.positions.flatMap((expected, index) => {
        const found = actual[index];
        if (found === undefined) return [`chunk:${expected.seed}`, `position:${expected.seed}`];

        return [
            ...(found.chunk[0] !== expected.chunk[0] || found.chunk[1] !== expected.chunk[1]
                ? [`chunk:${expected.seed}`]
                : []),
            ...(found.block[0] !== expected.block[0] ||
            found.block[1] !== expected.block[1] ||
            found.block[2] !== expected.block[2]
                ? [`position:${expected.seed}`]
                : [])
        ];
    });
    const verdict = checkAllowList(FAMILIES.worldgenSpawn, gaps);

    it("selects Java's origin position and containing chunk for every pinned seed", () => {
        expect(verdict.unexpected).toEqual([]);
    });

    it('keeps no stale spawn parity gap', () => {
        expect(verdict.stale).toEqual([]);
    });

    it('covers ocean origins and Java’s origin result', () => {
        const originOceanSeeds = ['0', '1234'].filter(
            (seed) => generator.surfaceAt(0, 0, BigInt(seed))?.name === 'minecraft:water'
        );
        expect(originOceanSeeds).toEqual(['0', '1234']);
        expect(actual.find(({ seed }) => seed === '987654321')).toMatchObject({ chunk: [0, 0], block: [0, 0, 0] });
        reportParityProgress(FAMILIES.worldgenSpawn, {
            javaSeeds: actual.length,
            climateCandidates: actual.reduce((count, entry) => count + entry.candidates, 0),
            oceanOrigins: originOceanSeeds.length
        });
    });
});
