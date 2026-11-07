import { describe, expect, it } from 'vitest';

import {
    TPS_RETENTION_MS,
    TPS_WINDOWS,
    pruneSamples,
    rateForWindow,
    seriesForWindow,
    summarizeWindow
} from './tpsHistory';
import type { TpsSample } from './tpsHistory';

const sample = (at: number, tps: number, rate = 20): TpsSample => ({ at, tps, rate });

describe('TPS_WINDOWS', () => {
    it('ends at the retention limit so the longest span always has its data', () => {
        expect(TPS_WINDOWS.at(-1)?.ms).toBe(TPS_RETENTION_MS);
    });
});

describe('pruneSamples', () => {
    it('drops readings older than the retention limit and keeps the rest in order', () => {
        const now = TPS_RETENTION_MS + 10_000;
        const samples = [sample(0, 1), sample(9_999, 2), sample(10_000, 3), sample(now, 4)];

        pruneSamples(samples, now);

        expect(samples.map((entry) => entry.tps)).toEqual([3, 4]);
    });
});

describe('seriesForWindow', () => {
    it('takes the lowest reading in each slice', () => {
        const samples = [sample(1_000, 20), sample(2_000, 12), sample(3_000, 19), sample(7_000, 20)];

        expect(seriesForWindow(samples, 10_000, 10_000, 5)).toEqual([20, 12, 19, 20, 20]);
    });

    it('repeats the last known value across slices without a reading', () => {
        const samples = [sample(0, 18)];

        expect(seriesForWindow(samples, 4_000, 4_000, 4)).toEqual([18, 18, 18, 18]);
    });

    it('leaves slices before the first reading empty', () => {
        const samples = [sample(6_000, 20)];

        expect(seriesForWindow(samples, 10_000, 10_000, 5)).toEqual([undefined, undefined, undefined, 20, 20]);
    });

    it('starts from the reading that was current when the window opened', () => {
        const samples = [sample(0, 13), sample(8_000, 20)];

        expect(seriesForWindow(samples, 10_000, 4_000, 4)).toEqual([13, 13, 20, 20]);
    });

    it('counts a reading taken exactly at the end in the last slice', () => {
        const samples = [sample(10_000, 14)];

        expect(seriesForWindow(samples, 10_000, 10_000, 2)).toEqual([undefined, 14]);
    });
});

describe('rateForWindow', () => {
    it('is the highest rate set during the window', () => {
        const samples = [sample(1_000, 20), sample(5_000, 40, 40), sample(8_000, 20)];

        expect(rateForWindow(samples, 10_000, 10_000)).toBe(40);
    });

    it('forgets a rate that ended before the window opened', () => {
        const samples = [sample(0, 40, 40), sample(1_000, 20), sample(15_000, 20)];

        expect(rateForWindow(samples, 20_000, 10_000)).toBe(20);
    });

    it('counts the rate that was in effect when the window opened', () => {
        const samples = [sample(0, 40, 40), sample(15_000, 20)];

        expect(rateForWindow(samples, 20_000, 10_000)).toBe(40);
    });

    it('has no rate without a reading', () => {
        expect(rateForWindow([], 10_000, 10_000)).toBeUndefined();
    });
});

describe('summarizeWindow', () => {
    it('has nothing to say without a reading', () => {
        expect(summarizeWindow([], 10_000, 10_000)).toBeUndefined();
        expect(summarizeWindow([sample(20_000, 20)], 10_000, 10_000)).toBeUndefined();
    });

    it('weights each reading by how long it was the latest', () => {
        const samples = [sample(0, 20), sample(9_000, 10)];

        const stats = summarizeWindow(samples, 10_000, 10_000);

        expect(stats?.average).toBeCloseTo(19, 5);
        expect(stats).toMatchObject({ min: 10, max: 20 });
    });

    it('ignores readings that ended before the window opened', () => {
        const samples = [sample(0, 5), sample(1_000, 20)];

        const stats = summarizeWindow(samples, 20_000, 10_000);

        expect(stats).toEqual({ average: 20, min: 20, max: 20 });
    });

    it('returns the lone reading when no time has passed', () => {
        expect(summarizeWindow([sample(5_000, 17)], 5_000, 60_000)).toEqual({ average: 17, min: 17, max: 17 });
    });
});
