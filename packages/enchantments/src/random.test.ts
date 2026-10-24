import { describe, expect, it } from 'vitest';

import { gaussianFrom, javaRandom } from './random';

/**
 * Every expected value here came out of a `java.util.Random` run on the JDK,
 * not out of this implementation, so the test disagrees with the code when the
 * code is wrong.
 */
describe('javaRandom', () => {
    it('reproduces nextInt for seed 0', () => {
        const random = javaRandom(0);
        expect([0, 0, 0, 0, 0].map(() => random.nextInt(8))).toEqual([5, 6, 1, 4, 5]);
        expect([0, 0, 0].map(() => random.nextInt(50))).toEqual([3, 41, 11]);
    });

    it('reproduces nextFloat and nextGaussian after the integer draws', () => {
        const random = javaRandom(0);
        for (let draw = 0; draw < 5; draw += 1) random.nextInt(8);
        for (let draw = 0; draw < 3; draw += 1) random.nextInt(50);

        const floats = [0, 0, 0].map(() => random.nextFloat());
        expect(floats[0]).toBeCloseTo(0.59754527, 7);
        expect(floats[1]).toBeCloseTo(0.7815346, 7);
        expect(floats[2]).toBeCloseTo(0.3332184, 7);

        const gaussians = [0, 0, 0].map(() => random.nextGaussian());
        expect(gaussians[0]).toBeCloseTo(-1.4198997926388122, 12);
        expect(gaussians[1]).toBeCloseTo(0.6492070824419385, 12);
        expect(gaussians[2]).toBeCloseTo(-0.9326974581119112, 12);

        expect([0, 0, 0].map(() => random.nextInt(10))).toEqual([7, 2, 0]);
    });

    it('reproduces a negative seed', () => {
        const random = javaRandom(-5);
        expect([0, 0, 0, 0, 0].map(() => random.nextInt(8))).toEqual([2, 2, 2, 2, 3]);
        expect([0, 0, 0].map(() => random.nextInt(50))).toEqual([35, 7, 43]);
    });

    it('reproduces seed 123456789, whose stream exercises the 48 bit multiply', () => {
        const random = javaRandom(123456789);
        expect([0, 0, 0, 0, 0].map(() => random.nextInt(8))).toEqual([5, 6, 3, 2, 3]);
    });

    it('restarts the stream on setSeed', () => {
        const random = javaRandom(1);
        random.setSeed(999);
        expect([0, 0, 0].map(() => random.nextInt(100))).toEqual([59, 91, 31]);
    });

    it('draws a power of two bound through the wide multiply branch', () => {
        const random = javaRandom(42);
        expect([0, 0, 0, 0, 0].map(() => random.nextInt(16))).toEqual([11, 0, 10, 0, 4]);
    });
});

describe('gaussianFrom', () => {
    it('uses a source that provides nextGaussian', () => {
        expect(gaussianFrom(javaRandom(0))).toBe(javaRandom(0).nextGaussian());
    });

    it('draws a centered spread from a source that has no gaussian', () => {
        const stream = javaRandom(7);
        const uniformOnly = { nextFloat: () => stream.nextFloat(), nextInt: (bound: number) => stream.nextInt(bound) };

        const draws = Array.from({ length: 4000 }, () => gaussianFrom(uniformOnly));
        const mean = draws.reduce((total, draw) => total + draw, 0) / draws.length;
        const variance = draws.reduce((total, draw) => total + (draw - mean) ** 2, 0) / draws.length;

        expect(Math.abs(mean)).toBeLessThan(0.1);
        expect(variance).toBeGreaterThan(0.8);
        expect(variance).toBeLessThan(1.2);
    });
});
