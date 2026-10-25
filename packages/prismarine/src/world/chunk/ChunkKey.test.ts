import { describe, expect, it } from 'vitest';

import { World } from '../World';
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

    /**
     * The key a world stores a chunk under has to be the key it looks one up by.
     *
     * Nothing else checks that. `pnpm typecheck` skips `*.test.*`, and a double assembled
     * with `Object.assign(Object.create(World.prototype), { chunks })` never has its
     * `chunks` field compared against the class either. A map keyed the other way answers
     * null to every question instead of throwing, so the spawner's loaded check, the surface
     * scan and the path finder all read an empty world and report nothing wrong. A fixture
     * that kept a bigint key after this one became a number is what stopped mobs spawning in
     * `entity/data/live.test.ts`.
     */
    describe('World.getLoadedChunk', () => {
        const worldOver = (chunks: Map<number, Chunk>): World =>
            Object.assign(Object.create(World.prototype), { chunks });

        it('finds a chunk stored under the key packXZ returns', () => {
            const chunk = new Chunk(-3, 5);
            const world = worldOver(new Map([[Chunk.packXZ(-3, 5), chunk]]));

            expect(world.getLoadedChunk(-3, 5)).toBe(chunk);
            // The mirrored coordinate, which a key that dropped an axis would also answer.
            expect(world.getLoadedChunk(5, -3)).toBeNull();
        });

        it('answers for a coordinate it has already answered for another', () => {
            // The one-entry cache keyed on the last index: asking twice around a third
            // coordinate is what catches a cache that answers the wrong chunk.
            const here = new Chunk(0, 0);
            const there = new Chunk(-3, 5);
            const world = worldOver(
                new Map([
                    [Chunk.packXZ(0, 0), here],
                    [Chunk.packXZ(-3, 5), there]
                ])
            );

            expect(world.getLoadedChunk(0, 0)).toBe(here);
            expect(world.getLoadedChunk(-3, 5)).toBe(there);
            expect(world.getLoadedChunk(0, 0)).toBe(here);
            expect(world.getLoadedChunk(9, 9)).toBeNull();
            expect(world.getLoadedChunk(0, 0)).toBe(here);
        });
    });
});
