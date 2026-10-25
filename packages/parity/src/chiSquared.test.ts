import { describe, expect, it } from 'vitest';

import { MINIMUM_EXPECTED, chiSquaredTest, chiSquaredUpperTail } from './chiSquared.ts';

// The loot distribution row's verdict is only as good as this arithmetic, so the tail function
// is checked against published critical values rather than against itself.
describe('chiSquaredUpperTail', () => {
    // Critical values of the chi-squared distribution: the statistic at which the upper tail is
    // exactly the stated probability, as every statistical table prints them.
    const critical = [
        { degreesOfFreedom: 1, statistic: 3.8415, tail: 0.05 },
        { degreesOfFreedom: 1, statistic: 6.6349, tail: 0.01 },
        { degreesOfFreedom: 2, statistic: 5.9915, tail: 0.05 },
        { degreesOfFreedom: 2, statistic: 9.2103, tail: 0.01 },
        { degreesOfFreedom: 5, statistic: 11.0705, tail: 0.05 },
        { degreesOfFreedom: 5, statistic: 15.0863, tail: 0.01 },
        { degreesOfFreedom: 10, statistic: 18.307, tail: 0.05 },
        { degreesOfFreedom: 10, statistic: 29.5883, tail: 0.001 },
        { degreesOfFreedom: 30, statistic: 43.773, tail: 0.05 },
        { degreesOfFreedom: 30, statistic: 50.892, tail: 0.01 },
        { degreesOfFreedom: 100, statistic: 124.342, tail: 0.05 }
    ];

    it.each(critical)('gives $tail at $statistic with $degreesOfFreedom degrees of freedom', (row) => {
        expect(chiSquaredUpperTail(row.statistic, row.degreesOfFreedom)).toBeCloseTo(row.tail, 4);
    });

    it('gives 1 for a statistic of zero and for no degrees of freedom', () => {
        expect(chiSquaredUpperTail(0, 4)).toBe(1);
        expect(chiSquaredUpperTail(10, 0)).toBe(1);
    });

    it('falls monotonically as the statistic grows', () => {
        let previous = 1;
        for (let statistic = 1; statistic < 60; statistic += 1) {
            const tail = chiSquaredUpperTail(statistic, 8);
            expect(tail).toBeLessThan(previous);
            previous = tail;
        }
        expect(previous).toBeLessThan(1e-7);
    });
});

describe('chiSquaredTest', () => {
    it('finds nothing wrong with counts that match the model', () => {
        const result = chiSquaredTest([
            { label: 'a', observed: 100, expected: 100 },
            { label: 'b', observed: 200, expected: 200 }
        ]);

        expect(result.statistic).toBe(0);
        expect(result.degreesOfFreedom).toBe(1);
        expect(result.pValue).toBe(1);
    });

    it('rejects counts the model cannot account for', () => {
        const result = chiSquaredTest([
            { label: 'a', observed: 300, expected: 100 },
            { label: 'b', observed: 0, expected: 200 }
        ]);

        expect(result.statistic).toBeCloseTo(600, 6);
        expect(result.pValue).toBeLessThan(1e-9);
    });

    it('merges the sparse cells into one and counts the degrees of freedom after the merge', () => {
        const result = chiSquaredTest([
            { label: 'a', observed: 50, expected: 50 },
            { label: 'b', observed: 40, expected: 40 },
            { label: 'c', observed: 2, expected: 3 },
            { label: 'd', observed: 3, expected: 2 }
        ]);

        expect(result.merged).toBe(2);
        expect(result.cells).toHaveLength(3);
        expect(result.cells.at(-1)).toEqual({ label: 'other (2 categories)', observed: 5, expected: 5 });
        expect(result.degreesOfFreedom).toBe(2);
        for (const cell of result.cells) expect(cell.expected).toBeGreaterThanOrEqual(MINIMUM_EXPECTED);
    });

    it('has nothing to find in a single category', () => {
        const result = chiSquaredTest([{ label: 'a', observed: 10, expected: 10 }]);

        expect(result.degreesOfFreedom).toBe(0);
        expect(result.pValue).toBe(1);
    });

    it('holds its false positive rate over many fair samples', () => {
        // A deterministic linear congruential stream stands in for a sampler, so the rate is
        // the same on every machine. At alpha 0.01 over 400 fair six-sided draws of 600, a
        // handful of rejections is the distribution behaving, and a tenth of them is not.
        let state = 20260218;
        const next = (): number => {
            state = (state * 1103515245 + 12345) % 2147483648;
            return state / 2147483648;
        };

        let rejected = 0;
        for (let trial = 0; trial < 400; trial += 1) {
            const counts = [0, 0, 0, 0, 0, 0];
            for (let draw = 0; draw < 600; draw += 1) counts[Math.floor(next() * 6)]! += 1;
            const result = chiSquaredTest(
                counts.map((observed, face) => ({ label: `${face}`, observed, expected: 100 }))
            );
            if (result.pValue < 0.01) rejected += 1;
        }

        expect(rejected).toBeLessThan(16);
    });
});
