import { describe, expect, it } from 'vitest';

import { describePending, FULLY_GENERATED, pendingChunks, sessionVerdict } from './completion.ts';
import { REFERENCE_REGION, tileRegion } from './region.ts';

/** A saved world double that holds an explicit finalized state per chunk. */
const savedStates = (states: Iterable<[x: number, z: number, state: number]>) => {
    const byChunk = new Map([...states].map(([x, z, state]) => [`${x},${z}`, state]));
    return (x: number, z: number): number | null => byChunk.get(`${x},${z}`) ?? null;
};

describe('pendingChunks', () => {
    const tile = { chunkX: 0, chunkZ: 0, chunksX: 2, chunksZ: 2 };

    it('reports every chunk of an empty save, in row-major order with x fastest', () => {
        const pending = pendingChunks([tile], savedStates([]));
        expect(pending).toEqual([
            { x: 0, z: 0, state: null },
            { x: 1, z: 0, state: null },
            { x: 0, z: 1, state: null },
            { x: 1, z: 1, state: null }
        ]);
    });

    it('keeps a chunk saved mid-generation pending, with the state it is stuck at', () => {
        const pending = pendingChunks(
            [tile],
            savedStates([
                [0, 0, FULLY_GENERATED],
                [1, 0, 0],
                [0, 1, 1],
                [1, 1, FULLY_GENERATED]
            ])
        );
        expect(pending).toEqual([
            { x: 1, z: 0, state: 0 },
            { x: 0, z: 1, state: 1 }
        ]);
    });

    it('is empty once every chunk of every tile is fully generated', () => {
        const tiles = tileRegion(REFERENCE_REGION);
        const done: [number, number, number][] = [];
        for (const t of tiles) {
            for (let z = 0; z < t.chunksZ; z++) {
                for (let x = 0; x < t.chunksX; x++) done.push([t.chunkX + x, t.chunkZ + z, FULLY_GENERATED]);
            }
        }
        expect(pendingChunks(tiles, savedStates(done))).toEqual([]);
        expect(done).toHaveLength(REFERENCE_REGION.chunksX * REFERENCE_REGION.chunksZ);
    });

    it('checks only the tiles it is given, which is how a budget save point scopes itself', () => {
        const tiles = tileRegion(REFERENCE_REGION).slice(0, 1);
        const pending = pendingChunks(tiles, savedStates([]));
        expect(pending).toHaveLength(100);
        expect(pending.every(({ x, z }) => x < 10 && z < 10)).toBe(true);
    });
});

describe('sessionVerdict', () => {
    it('finishes only when nothing is pending', () => {
        expect(sessionVerdict(0, 0, 1000, 0)).toBe('done');
        expect(sessionVerdict(0, 5000, 1000, 99)).toBe('done');
    });

    it('waits while the save is still making progress inside the budget', () => {
        expect(sessionVerdict(5, 0, 1000, 0)).toBe('wait');
        expect(sessionVerdict(5, 999, 1000, 3, 4)).toBe('wait');
    });

    it('restarts the session once the live save stops moving', () => {
        expect(sessionVerdict(5, 500, 1000, 4, 4)).toBe('restart');
    });

    it('times out rather than waiting past the budget, even while progressing', () => {
        expect(sessionVerdict(1, 1000, 1000, 0)).toBe('timeout');
        expect(sessionVerdict(1, 5000, 1000, 99)).toBe('timeout');
    });
});

describe('describePending', () => {
    it('reports expected versus actual counts, coordinates and stuck states', () => {
        expect(
            describePending(
                [
                    { x: 2, z: 0, state: null },
                    { x: 3, z: 0, state: 0 }
                ],
                4
            )
        ).toBe('2 of 4 chunks fully generated; pending 2: 2,0 3,0(state 0)');
    });

    it('truncates a long list instead of flooding the log', () => {
        const pending = Array.from({ length: 100 }, (_, i) => ({ x: i, z: 0, state: null }));
        expect(describePending(pending, 100, 3)).toBe(
            '0 of 100 chunks fully generated; pending 100: 0,0 1,0 2,0 (+97 more)'
        );
    });
});
