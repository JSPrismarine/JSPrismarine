import { describe, expect, it, vi } from 'vitest';

import type { ChunkHolder } from './ChunkHolder';
import { ChunkHolderMap } from './ChunkHolderMap';
import { ProtoChunk } from './ProtoChunk';

const newChunk = (chunkX: number, chunkZ: number): ProtoChunk =>
    ProtoChunk.create({ chunkX, chunkZ, minY: 0, height: 16 });

const positionsOf = (holders: Iterable<ChunkHolder>): string[] =>
    [...holders].map((holder) => `${holder.chunkX},${holder.chunkZ}`);

describe('retaining a holder', () => {
    it('creates a holder on the first acquisition and shares it afterwards', () => {
        const map = new ChunkHolderMap(newChunk);

        const first = map.acquire(4, -2);
        const second = map.acquire(4, -2);

        expect(second).toBe(first);
        expect(first.referenceCount).toBe(2);
        expect(map.size).toBe(1);
        expect(map.get(4, -2)).toBe(first);
    });

    it('keeps the holder while anything still needs it', () => {
        const map = new ChunkHolderMap(newChunk);
        map.acquire(0, 0);
        map.acquire(0, 0);

        expect(map.release(0, 0)).toBe(false);
        expect(map.get(0, 0)).toBeDefined();
        expect(map.size).toBe(1);
    });

    it('drops the holder when the last reference goes', () => {
        const map = new ChunkHolderMap(newChunk);
        map.acquire(0, 0);

        expect(map.release(0, 0)).toBe(true);
        expect(map.get(0, 0)).toBeUndefined();
        expect(map.size).toBe(0);
    });

    it('refuses a release of a chunk nothing holds', () => {
        const map = new ChunkHolderMap(newChunk);

        expect(() => map.release(9, 9)).toThrow(RangeError);
        expect(() => map.release(9, 9)).toThrow('No holder at 9, 9 to release.');
    });

    it('keeps holders for distinct chunks apart, including a transposed pair', () => {
        const map = new ChunkHolderMap(newChunk);

        map.acquire(1, -2);
        map.acquire(-2, 1);

        expect(map.size).toBe(2);
        expect(map.get(1, -2)).not.toBe(map.get(-2, 1));
    });

    it('allocates no chunk for a holder nothing has stepped', () => {
        const factory = vi.fn(newChunk);
        const map = new ChunkHolderMap(factory);

        map.acquireSquare(0, 0, 9);

        expect(map.size).toBe(361);
        expect(factory).not.toHaveBeenCalled();
    });
});

describe('acquiring a square', () => {
    it('takes every chunk inside the radius, row major with x ascending fastest', () => {
        const map = new ChunkHolderMap(newChunk);

        const square = map.acquireSquare(5, 5, 1);

        expect(positionsOf(square)).toEqual(['4,4', '5,4', '6,4', '4,5', '5,5', '6,5', '4,6', '5,6', '6,6']);
    });

    it('counts (2r + 1) squared, which is 361 at the radius a terrain target needs', () => {
        const map = new ChunkHolderMap(newChunk);

        expect(map.acquireSquare(0, 0, 0)).toHaveLength(1);
        expect(map.acquireSquare(0, 0, 1)).toHaveLength(9);
        expect(map.acquireSquare(0, 0, 9)).toHaveLength(361);
        expect(map.acquireSquare(0, 0, 11)).toHaveLength(529);
    });

    it('leaves a holder a neighboring run still needs, and drops the rest', () => {
        // Two runs, at x 0 to 2 and x 2 to 4, sharing the column at x = 2. The first run finishing
        // must not take those three away from the second, which is why the count exists.
        const map = new ChunkHolderMap(newChunk);
        const first = map.acquireSquare(1, 0, 1);
        const second = map.acquireSquare(3, 0, 1);

        expect(map.size).toBe(15);
        expect(map.get(2, 0)?.referenceCount).toBe(2);
        expect(map.get(1, 0)?.referenceCount).toBe(1);

        map.releaseAll(first);

        expect(map.size).toBe(9);
        expect(positionsOf(map.values())).toEqual(['2,-1', '2,0', '2,1', '3,-1', '4,-1', '3,0', '4,0', '3,1', '4,1']);

        map.releaseAll(second);

        expect(map.size).toBe(0);
    });
});
