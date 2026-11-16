import { describe, expect, it } from 'vitest';

import { effectiveDifficulty, specialMultiplier } from './localDifficulty';

describe('effectiveDifficulty', () => {
    it('gives a fresh world three quarters of the difficulty id', () => {
        expect(effectiveDifficulty('peaceful', 0)).toBe(0);
        expect(effectiveDifficulty('easy', 0)).toBe(0.75);
        expect(effectiveDifficulty('normal', 0)).toBe(1.5);
        expect(effectiveDifficulty('hard', 0)).toBe(2.25);
    });

    it('climbs to twice the id on an old, long-lived chunk under a full moon', () => {
        // Day 800 is past the ramp and falls on a full moon.
        const old = 800 * 24_000;
        expect(effectiveDifficulty('hard', old, 3_600_000)).toBe(6.75);
        expect(effectiveDifficulty('normal', old, 3_600_000)).toBe(4);
    });

    it('gives the special multiplier only past an effective difficulty of 2', () => {
        expect([1.5, 2, 3, 4, 6.75].map(specialMultiplier)).toEqual([0, 0, 0.5, 1, 1]);
    });
});
