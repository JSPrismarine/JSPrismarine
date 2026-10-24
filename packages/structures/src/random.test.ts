import { describe, expect, it } from 'vitest';

import { createLegacyRandom, largeFeatureSeed, largeFeatureWithSaltSeed } from './random';

/**
 * The expected values come from `java.util.Random` itself, printed by a short
 * program run against the JDK. They are the oracle: this generator has to
 * produce Java's stream exactly, or a seed places a village somewhere Java
 * would not.
 */
describe('createLegacyRandom', () => {
    it('reproduces nextInt from seed 0', () => {
        const random = createLegacyRandom(0);

        expect([random.nextInt(), random.nextInt(), random.nextInt(), random.nextInt(), random.nextInt()]).toEqual([
            -1155484576, -723955400, 1033096058, -1690734402, -1557280266
        ]);
    });

    it('reproduces a bounded nextInt that is not a power of two', () => {
        const random = createLegacyRandom(42);

        expect(Array.from({ length: 5 }, () => random.nextInt(100))).toEqual([30, 63, 48, 84, 70]);
    });

    it('reproduces a bounded nextInt that is a power of two, which Java shortcuts', () => {
        const random = createLegacyRandom(42);

        expect(Array.from({ length: 5 }, () => random.nextInt(16))).toEqual([11, 0, 10, 0, 4]);
    });

    it('reproduces nextFloat at the 24 bits of precision Java uses', () => {
        const random = createLegacyRandom(123456789);

        expect(Array.from({ length: 3 }, () => random.nextFloat())).toEqual([
            Math.fround(0.66403806),
            Math.fround(0.76331645),
            Math.fround(0.45695174)
        ]);
    });

    it('reproduces nextDouble, which consumes two draws', () => {
        const random = createLegacyRandom(123456789);

        expect(Array.from({ length: 3 }, () => random.nextDouble())).toEqual([
            0.664038103272266, 0.45695178590520646, 0.39050647939140426
        ]);
    });

    it('reproduces nextLong and nextBoolean', () => {
        const longs = createLegacyRandom(7);
        expect([longs.nextLong(), longs.nextLong(), longs.nextLong()]).toEqual([
            -4967725919621401576n,
            -4627004027837150407n,
            6425179856112732765n
        ]);

        const booleans = createLegacyRandom(7);
        expect(Array.from({ length: 5 }, () => booleans.nextBoolean())).toEqual([true, true, true, false, false]);
    });

    it('rejects a bound that is not a positive integer', () => {
        expect(() => createLegacyRandom(1).nextInt(0)).toThrow(RangeError);
        expect(() => createLegacyRandom(1).nextInt(-4)).toThrow(RangeError);
    });

    it('forks a stream that does not disturb the parent', () => {
        const parent = createLegacyRandom(99);
        const forked = parent.fork();
        const reference = createLegacyRandom(99);
        reference.nextLong();

        expect(parent.nextInt()).toBe(reference.nextInt());
        expect(forked.nextInt()).not.toBe(parent.nextInt());
    });
});

describe('largeFeatureWithSaltSeed', () => {
    it('mixes the region coordinates and the salt the way Java does', () => {
        const seed = largeFeatureWithSaltSeed(1234n, 3, -5, 10387312);

        expect(seed).toBe(361139836977n);

        const random = createLegacyRandom(seed);
        expect([random.nextInt(26), random.nextInt(26)]).toEqual([20, 0]);
    });
});

describe('largeFeatureSeed', () => {
    it('depends on both the world seed and the region, and is stable', () => {
        expect(largeFeatureSeed(1234n, 3, -5)).toBe(largeFeatureSeed(1234n, 3, -5));
        expect(largeFeatureSeed(1234n, 3, -5)).not.toBe(largeFeatureSeed(1234n, 3, -4));
        expect(largeFeatureSeed(1234n, 3, -5)).not.toBe(largeFeatureSeed(1235n, 3, -5));
    });
});
