import { describe, expect, it } from 'vitest';

import type { TickSample } from './TickRecorder';
import { percentileOf, summarizeTicks, TickRecorder } from './TickRecorder';

const tick = (n: number, over: Partial<TickSample> = {}): TickSample => ({
    tick: n,
    latenessMs: 0,
    elapsedMs: 10,
    tickHandlersMs: 1,
    worldUpdatesMs: 5,
    chunkCompletionsMs: 1,
    chunkSchedulerMs: 1,
    ...over
});

describe('percentileOf', () => {
    it('uses the nearest rank', () => {
        const values = Array.from({ length: 100 }, (_, index) => index + 1);
        expect(percentileOf(values, 50)).toBe(50);
        expect(percentileOf(values, 99)).toBe(99);
        expect(percentileOf(values, 100)).toBe(100);
        expect(percentileOf([], 99)).toBe(0);
    });
});

describe('summarizeTicks', () => {
    it('attributes an overrunning tick to its longest phase', () => {
        const summary = summarizeTicks([
            tick(1),
            tick(2, { elapsedMs: 80, chunkCompletionsMs: 60, worldUpdatesMs: 10 }),
            tick(3, { elapsedMs: 90, worldUpdatesMs: 70 }),
            tick(4, {
                elapsedMs: 120,
                tickHandlersMs: 1,
                worldUpdatesMs: 1,
                chunkCompletionsMs: 1,
                chunkSchedulerMs: 1
            })
        ]);

        expect(summary.ticks).toBe(4);
        expect(summary.overrunCauses).toEqual({
            tickHandlersMs: 0,
            worldUpdatesMs: 1,
            chunkCompletionsMs: 1,
            chunkSchedulerMs: 0,
            other: 1
        });
        expect(summary.elapsedMs.max).toBe(120);
    });

    it('reads zero for no ticks', () => {
        expect(summarizeTicks([]).elapsedMs).toEqual({ mean: 0, p50: 0, p99: 0, max: 0 });
    });
});

describe('TickRecorder', () => {
    it('returns the ticks in a range, oldest first, and forgets the oldest past its capacity', () => {
        const recorder = new TickRecorder(4);
        for (let n = 0; n < 6; n++) recorder.record(tick(n));

        expect(recorder.between(0).map((sample) => sample.tick)).toEqual([2, 3, 4, 5]);
        expect(recorder.between(3, 5).map((sample) => sample.tick)).toEqual([3, 4]);
    });
});
