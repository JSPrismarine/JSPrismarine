import { describe, expect, it } from 'vitest';

import Chunk from './Chunk';

/** The world border is 30000000 blocks from origin, which is this many chunks. */
const BORDER_CHUNKS = 30_000_000 / 16;

/** The widest coordinate 22 bits an axis can hold. */
const AXIS_LIMIT = 2 ** 21;

describe('world', () => {
    describe('Chunk.packXZ', () => {
        it('round-trips every coordinate inside the world border', () => {
            const coordinates = [
                0,
                1,
                -1,
                16,
                -16,
                1234,
                -1234,
                BORDER_CHUNKS,
                -BORDER_CHUNKS,
                AXIS_LIMIT - 1,
                -AXIS_LIMIT
            ];

            for (const x of coordinates) {
                for (const z of coordinates) {
                    expect(Chunk.unpackXZ(Chunk.packXZ(x, z))).toEqual([x, z]);
                }
            }
        });

        it('gives a distinct key to every chunk of a region', () => {
            const keys = new Set<number>();
            for (let x = -40; x <= 40; x++) {
                for (let z = -40; z <= 40; z++) keys.add(Chunk.packXZ(x, z));
            }

            expect(keys.size).toBe(81 * 81);
        });

        it('stays an exact integer, which is what lets a key be a number at all', () => {
            for (const [x, z] of [
                [AXIS_LIMIT - 1, AXIS_LIMIT - 1],
                [-AXIS_LIMIT, -AXIS_LIMIT],
                [BORDER_CHUNKS, -BORDER_CHUNKS]
            ] as const) {
                const key = Chunk.packXZ(x, z);

                expect(Number.isSafeInteger(key)).toBe(true);
                expect(key).toBeGreaterThanOrEqual(0);
            }
        });

        it('does not confuse the two axes', () => {
            expect(Chunk.packXZ(1, 0)).not.toBe(Chunk.packXZ(0, 1));
            expect(Chunk.unpackXZ(Chunk.packXZ(5, -3))).toEqual([5, -3]);
            expect(Chunk.unpackXZ(Chunk.packXZ(-3, 5))).toEqual([-3, 5]);
        });
    });
});
