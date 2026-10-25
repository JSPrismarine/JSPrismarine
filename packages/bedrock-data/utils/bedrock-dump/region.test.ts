import { describe, expect, it } from 'vitest';

import {
    blockBounds,
    chunksOf,
    contains,
    MAX_AREA_SIDE,
    MAX_CHUNKS_PER_AREA,
    MAX_TICKING_AREAS,
    REFERENCE_REGION,
    SAMPLE_REGION,
    tileRegion
} from './region.ts';

describe('tileRegion', () => {
    it('covers the reference region without exceeding either engine limit', () => {
        const tiles = tileRegion(REFERENCE_REGION);
        expect(tiles.length).toBeLessThanOrEqual(MAX_TICKING_AREAS);
        for (const tile of tiles) {
            expect(tile.chunksX * tile.chunksZ).toBeLessThanOrEqual(MAX_CHUNKS_PER_AREA);
            expect(tile.chunksX).toBeLessThanOrEqual(MAX_AREA_SIDE);
            expect(tile.chunksZ).toBeLessThanOrEqual(MAX_AREA_SIDE);
        }
    });

    it('tiles every chunk of the region exactly once', () => {
        const covered = new Set<string>();
        for (const tile of tileRegion(REFERENCE_REGION)) {
            for (const chunk of chunksOf(tile)) {
                const key = `${chunk.x},${chunk.z}`;
                expect(covered.has(key)).toBe(false);
                covered.add(key);
            }
        }
        expect(covered.size).toBe(REFERENCE_REGION.chunksX * REFERENCE_REGION.chunksZ);
        for (const chunk of chunksOf(REFERENCE_REGION)) expect(covered.has(`${chunk.x},${chunk.z}`)).toBe(true);
    });

    it('keeps a partial last tile rather than overrunning the region', () => {
        const tiles = tileRegion({ chunkX: -5, chunkZ: 3, chunksX: 12, chunksZ: 10 });
        expect(tiles.map((tile) => [tile.chunkX, tile.chunkZ, tile.chunksX, tile.chunksZ])).toEqual([
            [-5, 3, 10, 10],
            [5, 3, 2, 10]
        ]);
    });

    it('refuses a region that needs more areas than a world may hold', () => {
        expect(() => tileRegion({ chunkX: 0, chunkZ: 0, chunksX: 40, chunksZ: 40 })).toThrow(/16 ticking areas/);
    });
});

describe('blockBounds', () => {
    it('spans the whole last chunk', () => {
        expect(blockBounds({ chunkX: 0, chunkZ: 0, chunksX: 10, chunksZ: 10 })).toEqual({
            from: [0, 0],
            to: [159, 159]
        });
    });

    it('follows a negative origin', () => {
        expect(blockBounds({ chunkX: -2, chunkZ: 1, chunksX: 1, chunksZ: 1 })).toEqual({
            from: [-32, 16],
            to: [-17, 31]
        });
    });
});

describe('the sample region', () => {
    it('sits inside the reference region', () => {
        for (const chunk of chunksOf(SAMPLE_REGION)) {
            expect(contains(REFERENCE_REGION, chunk.x, chunk.z)).toBe(true);
        }
    });
});
