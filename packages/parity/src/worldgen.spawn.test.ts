import { DataDrivenGenerator } from '@jsprismarine/prismarine/world/generators/datadriven/DataDrivenGenerator';
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
    const actual = vectors.positions.map(({ seed }) => ({ seed, ...generator.spawnChunk(BigInt(seed)) }));
    const gaps = vectors.positions.flatMap((expected, index) => {
        const found = actual[index];
        return found === undefined || found.chunkX !== expected.chunk[0] || found.chunkZ !== expected.chunk[1]
            ? [`chunk:${expected.seed}`]
            : [];
    });
    const verdict = checkAllowList(FAMILIES.worldgenSpawn, gaps);

    it("selects Java's origin chunk for every pinned seed", () => {
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
        expect(actual.find(({ seed }) => seed === '987654321')).toMatchObject({ chunkX: 0, chunkZ: 0 });
        reportParityProgress(FAMILIES.worldgenSpawn, {
            javaSeeds: actual.length,
            climateCandidates: actual.reduce((count, entry) => count + entry.candidates, 0),
            oceanOrigins: originOceanSeeds.length
        });
    });
});
