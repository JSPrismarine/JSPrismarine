import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import registryVectors from '../../vectors/surface-registries.json' with { type: 'json' };
import { RandomState } from '../RandomState';
import { WorldgenData } from '../WorldgenData';
import { CHUNK_SIZE, ChunkSampler } from './ChunkSampler';

/**
 * Golden-output regression coverage for performance work.
 *
 * The jar-vector tests in `chunk.test.ts` prove nine columns match Java exactly, but they need
 * the pinned jar. These hashes pin six whole chunks, 98304 blocks each, on every checkout: a
 * change to any block state or fluid update flag changes a hash, so an optimization that
 * alters output fails here before it reaches a parity run.
 *
 * The hashes were captured from the implementation those jar vectors verified. A deliberate
 * change to the terrain has to replace them, and the replacement is only trustworthy if the
 * jar-vector tests pass first: run `JSP_WORLDGEN_VANILLA=1 vitest run src/chunk` and take the
 * digests this test reports.
 */

const parseDocuments = (source: Record<string, string>): Map<string, unknown> =>
    new Map(Object.entries(source).map(([id, document]) => [id, JSON.parse(document) as unknown]));

const data = new WorldgenData({
    densityFunctions: parseDocuments(registryVectors.densityFunctions),
    noises: parseDocuments(registryVectors.noises),
    noiseSettings: parseDocuments(registryVectors.noiseSettings)
});

const SEED = 1234n;

const GOLDEN_CHUNKS = [
    { chunkX: 3, chunkZ: -5, sha256: '1ccd9aa1157c573005bf2585f0d2bd7c97e5b39e3efaacfd80be3c0623a60c3d' },
    { chunkX: 5, chunkZ: -8, sha256: '306ff4dacb5e62fa80bf41ca422b79e248b6b59f70a5e1dd7d9789261445bcf7' },
    { chunkX: 7, chunkZ: -11, sha256: 'bbd2a9204eeff61710ec422e9bfdb10690371f96d3cb2901020e88c7e28c1937' },
    { chunkX: 9, chunkZ: -14, sha256: '92cbfe4ec7c132ac6f2d73df469fcefe0f62b9f98b887a1acb3aa63255938c85' },
    { chunkX: 11, chunkZ: -17, sha256: '50eb301b5afea778d1cd1cd6adf83c4b661ddae738da87236d66c44c2951941e' },
    { chunkX: 13, chunkZ: -20, sha256: 'cae6456cb3748122f9e1531f5d16534f76b619e7c1cdaac39990bae5ca645624' }
] as const;

const hashChunk = (sampler: ChunkSampler): string => {
    const hash = createHash('sha256');
    for (const row of sampler.fill()) {
        for (const column of row) {
            for (const block of column) hash.update(`${block.state}|${block.scheduleFluidUpdate ? 1 : 0}\n`);
        }
    }
    return hash.digest('hex');
};

describe('the overworld golden chunks', () => {
    const state = new RandomState(data, SEED, data.settings('minecraft:overworld'));

    it.each(GOLDEN_CHUNKS)(
        'reproduces chunk $chunkX,$chunkZ bit for bit',
        { timeout: 120_000 },
        ({ chunkX, chunkZ, sha256 }) => {
            expect(hashChunk(new ChunkSampler(state, { chunkX, chunkZ }))).toBe(sha256);
        }
    );

    it.each(GOLDEN_CHUNKS.slice(0, 2))(
        'walks chunk $chunkX,$chunkZ cell by cell to the same blocks',
        { timeout: 120_000 },
        ({ chunkX, chunkZ }) => {
            // The cell walk exists only to keep an interpolation cell current for longer, so
            // it has to answer with the same block and the same fluid update flag at every one
            // of the 98304 positions the column walk reaches, and reach no other position.
            const columns = new Map<string, string>();
            const byColumn = new ChunkSampler(state, { chunkX, chunkZ });
            for (let localZ = 0; localZ < CHUNK_SIZE; localZ++) {
                for (let localX = 0; localX < CHUNK_SIZE; localX++) {
                    const x = chunkX * CHUNK_SIZE + localX;
                    const z = chunkZ * CHUNK_SIZE + localZ;
                    byColumn.forEachColumnBlock(x, z, (y, block, scheduleFluidUpdate) => {
                        columns.set(`${x},${y},${z}`, `${block}|${scheduleFluidUpdate ? 1 : 0}`);
                    });
                }
            }

            const cells = new Map<string, string>();
            const byCell = new ChunkSampler(state, { chunkX, chunkZ });
            for (let cell = 0; cell < byCell.cellCount; cell++) {
                byCell.forEachCellBlock(cell, (x, y, z, block, scheduleFluidUpdate) => {
                    cells.set(`${x},${y},${z}`, `${block}|${scheduleFluidUpdate ? 1 : 0}`);
                });
            }

            expect(columns.size).toBe(CHUNK_SIZE * CHUNK_SIZE * 384);
            expect([...cells].sort()).toEqual([...columns].sort());
        }
    );
});
