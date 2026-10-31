/**
 * The biome walk `/locate biome` runs, against a resolver that answers by position.
 *
 * The order is what these tests pin. Java visits the horizontal grid in one spiral and each
 * column from the origin's height outward, and returns the first cell it meets, so two cells of
 * the wanted biome at the same distance are told apart by that order and nothing else.
 */
import { describe, expect, it } from 'vitest';

import type { BiomeSearchOptions } from './biomeSearch';
import { findClosestBiome } from './biomeSearch';

const WANTED = 'minecraft:plains';
const OTHER = 'minecraft:ocean';

/** A search from the origin over the Overworld's bounds, with Java's `/locate biome` steps. */
const searchFor = (
    wantedAt: (quartX: number, quartY: number, quartZ: number) => boolean,
    overrides: Partial<BiomeSearchOptions> = {}
): ReturnType<typeof findClosestBiome> =>
    findClosestBiome({
        origin: { x: 0, y: 64, z: 0 },
        radius: 6400,
        horizontalStep: 32,
        verticalStep: 64,
        minY: -64,
        height: 384,
        possibleBiomes: [WANTED, OTHER],
        wanted: (biome) => biome === WANTED,
        noiseBiome: (quartX, quartY, quartZ) => (wantedAt(quartX, quartY, quartZ) ? WANTED : OTHER),
        ...overrides
    });

describe('findClosestBiome', () => {
    it('answers the origin itself when it already has the biome', () => {
        expect(searchFor(() => true)).toEqual({ biome: WANTED, x: 0, y: 64, z: 0 });
    });

    it('samples at quart resolution, so the answer is a grid position in blocks', () => {
        // The wanted cell is the quart at block (64, 64, 0) and nothing else.
        const found = searchFor((quartX, quartY, quartZ) => quartX === 16 && quartY === 16 && quartZ === 0);

        expect(found).toEqual({ biome: WANTED, x: 64, y: 64, z: 0 });
    });

    it("walks the grid in Java's spiral: east first, then south, then around", () => {
        // Two cells one step out: east at (32, 0) and south at (0, 32). Java's spiral leaves
        // the origin eastward, so east wins the tie.
        const east = searchFor(
            (quartX, _quartY, quartZ) => (quartX === 8 && quartZ === 0) || (quartX === 0 && quartZ === 8)
        );
        expect(east).toMatchObject({ x: 32, z: 0 });

        // The spiral's next leg turns south, then west along the far side: (32, 32) comes
        // before (0, 32), which comes before (-32, 32).
        const corner = searchFor((quartX, _quartY, quartZ) => quartZ === 8 && quartX >= -8 && quartX <= 8);
        expect(corner).toMatchObject({ x: 32, z: 32 });

        const west = searchFor((quartX, _quartY, quartZ) => quartZ === 8 && quartX <= 0 && quartX >= -8);
        expect(west).toMatchObject({ x: 0, z: 32 });
    });

    it('tries the column above the origin before the one below', () => {
        // Cells at y 128 and y 0, each one vertical step from the origin at 64.
        const found = searchFor((_quartX, quartY) => quartY === 32 || quartY === 0);

        expect(found).toEqual({ biome: WANTED, x: 0, y: 128, z: 0 });
    });

    it('keeps alternating outward in height, skipping a side that has run out', () => {
        const seen: number[] = [];
        const found = searchFor((quartX, quartY, quartZ) => {
            if (quartX === 0 && quartZ === 0) seen.push(quartY);
            return quartY === 64;
        });

        expect(found).toEqual({ biome: WANTED, x: 0, y: 256, z: 0 });
        // 64, 128, 0, 192, 256: one step above and below in turn, and once -64 would fall
        // under Java's lower bound of the floor plus one, only the steps above remain.
        expect(seen).toEqual([16, 32, 0, 48, 64]);
    });

    it('stays inside the dimension when the origin is outside it', () => {
        const found = searchFor((_quartX, quartY) => quartY === 80, {
            origin: { x: 0, y: 1000, z: 0 }
        });

        // Clamped to the top bound of 320, then stepping down.
        expect(found).toEqual({ biome: WANTED, x: 0, y: 320, z: 0 });
    });

    it('answers nothing when the biome cannot occur in this dimension, without sampling', () => {
        let samples = 0;
        const found = searchFor(
            () => {
                samples++;
                return true;
            },
            { possibleBiomes: [OTHER] }
        );

        expect(found).toBe(undefined);
        expect(samples).toBe(0);
    });

    it('answers nothing when the radius holds none', () => {
        // The nearest wanted cell is 20 steps east; a radius of 10 steps never reaches it.
        const found = searchFor((quartX) => quartX >= 160, { radius: 320 });

        expect(found).toBe(undefined);
    });

    it('covers the whole square the radius spans', () => {
        // The far corner of a radius of two steps is (64, 64); the spiral ends there.
        const found = searchFor((quartX, _quartY, quartZ) => quartX === -16 && quartZ === -16, { radius: 64 });

        expect(found).toMatchObject({ x: -64, z: -64 });
    });
});
