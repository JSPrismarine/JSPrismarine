import { describe, expect, it } from 'vitest';

import { randomBetweenInclusive, randomWeighted, WorldgenRandom } from './WorldgenRandom';

describe('WorldgenRandom', () => {
    // The values Java produces live in `vectors.test.ts`. These cover the properties the
    // decoration pass relies on, which a matching value alone would not show.
    it('leaves the world seed untouched at the origin chunk', () => {
        // `chunkX * xScale + chunkZ * zScale ^ seed` is just the seed when both are zero.
        expect(new WorldgenRandom().setDecorationSeed(1234n, 0, 0)).toBe(1234n);
    });

    it('gives a different population seed to each chunk', () => {
        const seeds = new Set<bigint>();
        for (let chunkX = 0; chunkX < 4; chunkX++) {
            for (let chunkZ = 0; chunkZ < 4; chunkZ++) {
                seeds.add(new WorldgenRandom().setDecorationSeed(99n, chunkX * 16, chunkZ * 16));
            }
        }
        expect(seeds.size).toBe(16);
    });

    it('derives the same population seed for the same chunk and world seed', () => {
        const first = new WorldgenRandom().setDecorationSeed(-512n, 48, -80);
        const second = new WorldgenRandom().setDecorationSeed(-512n, 48, -80);
        expect(second).toBe(first);
    });

    it('separates feature streams by index and by step', () => {
        const populationSeed = new WorldgenRandom().setDecorationSeed(7n, 16, 32);
        const draw = (index: number, step: number) => {
            const random = new WorldgenRandom();
            random.setFeatureSeed(populationSeed, index, step);
            return random.nextInt();
        };

        expect(draw(0, 0)).not.toBe(draw(1, 0));
        expect(draw(0, 0)).not.toBe(draw(0, 1));
        expect(draw(0, 0)).toBe(draw(0, 0));
        // Step 1 index 0 and step 0 index 10000 collide by construction, as they do in Java.
        expect(draw(0, 1)).toBe(draw(10000, 0));
    });

    it('runs java.util.Random formulas over the Xoroshiro bit stream', () => {
        // A plain Xoroshiro source would answer differently from the first float onward, which is
        // the mistake this class exists to prevent.
        const worldgen = new WorldgenRandom(42n);
        const legacy = new WorldgenRandom(42n, 'legacy');
        expect(worldgen.nextFloat()).not.toBe(legacy.nextFloat());
    });

    it('reseeds rather than continuing the stream', () => {
        const random = new WorldgenRandom(5n);
        const first = random.nextInt();
        random.nextInt();
        random.setSeed(5n);
        expect(random.nextInt()).toBe(first);
    });

    it('draws every integer of an inclusive range and nothing outside it', () => {
        const random = new WorldgenRandom(1n);
        const seen = new Set<number>();
        for (let draw = 0; draw < 2000; draw++) seen.add(randomBetweenInclusive(random, -3, 3));
        expect([...seen].sort((a, b) => a - b)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
    });

    it('selects weighted entries in proportion to their weights', () => {
        const random = new WorldgenRandom(3n);
        const entries = [
            { value: 'common', weight: 9 },
            { value: 'rare', weight: 1 }
        ];
        let rare = 0;
        for (let draw = 0; draw < 10000; draw++) if (randomWeighted(entries, random) === 'rare') rare++;
        expect(rare).toBeGreaterThan(800);
        expect(rare).toBeLessThan(1200);
    });

    it('rejects an empty weighted list rather than returning nothing', () => {
        expect(() => randomWeighted([], new WorldgenRandom())).toThrow(RangeError);
    });
});
