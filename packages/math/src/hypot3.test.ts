import { describe, expect, it } from 'vitest';

import { hypot3 } from './hypot3';

/** A small deterministic generator, so a failure names the same inputs on every run. */
const lcg = (seed: number) => () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000 - 0.5;
};

const sameBits = (x: number, y: number, z: number) =>
    expect(Object.is(hypot3(x, y, z), Math.hypot(x, y, z))).toBe(true);

describe('hypot3', () => {
    it('returns exactly what Math.hypot returns for edge cases', () => {
        const edges = [
            0,
            -0,
            1,
            -1,
            3,
            4,
            5e-324,
            1e-200,
            1e-160,
            1e150,
            1e300,
            Number.MAX_VALUE,
            Infinity,
            -Infinity,
            NaN
        ];
        for (const x of edges) for (const y of edges) for (const z of edges) sameBits(x, y, z);
    });

    it('lets an infinite component win over NaN, as Math.hypot does', () => {
        expect(hypot3(NaN, Infinity, 1)).toBe(Infinity);
        expect(hypot3(NaN, 1, 2)).toBeNaN();
        expect(hypot3(0, -0, 0)).toBe(0);
    });

    it('matches Math.hypot bit for bit across random magnitudes', () => {
        const random = lcg(0x2798);
        const scales = [1000, 200, 1e-160, 1e150, 1];
        for (let index = 0; index < 200_000; index++) {
            const scale = scales[index % scales.length]!;
            sameBits(random() * scale, random() * scale, random() * scale);
        }
    });

    it('matches Math.hypot for whole-number and zero-heavy inputs', () => {
        const random = lcg(7);
        const whole = () => Math.round(random() * 40);
        for (let index = 0; index < 100_000; index++) sameBits(whole(), index % 3 === 0 ? 0 : whole(), whole());
    });
});
