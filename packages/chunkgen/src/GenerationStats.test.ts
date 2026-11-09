import { describe, expect, it } from 'vitest';

import {
    DURATION_BUCKET_BOUNDS_MS,
    GenerationStatsRecorder,
    mergeGenerationStats,
    shareLongerThan
} from './GenerationStats';

const sample = (over: Partial<Parameters<GenerationStatsRecorder['record']>[0]> = {}) => ({
    status: 'full' as const,
    priority: 'idle' as const,
    failed: false,
    backlogWaitMs: 0,
    turnaroundMs: 5,
    ...over
});

describe('GenerationStatsRecorder', () => {
    it('keeps one entry per status and band and counts failures', () => {
        const recorder = new GenerationStatsRecorder();
        recorder.record(sample());
        recorder.record(sample({ failed: true }));
        recorder.record(sample({ priority: 'immediate' }));
        recorder.record(sample({ status: 'features' }));

        const entries = recorder.snapshot().byTask;
        expect(entries).toHaveLength(3);
        const idleFull = entries.find((entry) => entry.status === 'full' && entry.priority === 'idle')!;
        expect(idleFull.tasks).toBe(2);
        expect(idleFull.failed).toBe(1);
    });

    it('puts a duration on its bound, so a task of exactly 10 ms is not longer than 10 ms', () => {
        const recorder = new GenerationStatsRecorder();
        for (const ms of [0.5, 10, 10.1, 30, 5000]) recorder.record(sample({ turnaroundMs: ms }));

        const { turnaround } = recorder.snapshot().byTask[0]!;
        expect(turnaround.count).toBe(5);
        expect(turnaround.maxMs).toBe(5000);
        expect(turnaround.buckets).toHaveLength(DURATION_BUCKET_BOUNDS_MS.length + 1);
        expect(shareLongerThan(turnaround, 10)).toBeCloseTo(3 / 5);
        expect(shareLongerThan(turnaround, 1000)).toBeCloseTo(1 / 5);
    });

    it('leaves the worker columns empty when a task did not report them', () => {
        const recorder = new GenerationStatsRecorder();
        recorder.record(sample());
        recorder.record(sample({ workerWallMs: 12, workerCpuMs: 9 }));

        const entry = recorder.snapshot().byTask[0]!;
        expect(entry.tasks).toBe(2);
        expect(entry.workerWall.count).toBe(1);
        expect(entry.workerCpu.totalMs).toBe(9);
        expect(shareLongerThan(entry.workerWall, 10)).toBe(1);
        expect(shareLongerThan({ count: 0, totalMs: 0, maxMs: 0, buckets: [] }, 10)).toBe(0);
    });

    it('hands out copies and forgets on reset', () => {
        const recorder = new GenerationStatsRecorder();
        recorder.record(sample());
        const before = recorder.snapshot();
        recorder.record(sample());

        expect(before.byTask[0]!.tasks).toBe(1);
        recorder.reset();
        expect(recorder.snapshot().byTask).toEqual([]);
    });

    it('merges shards by adding', () => {
        const left = new GenerationStatsRecorder();
        const right = new GenerationStatsRecorder();
        left.record(sample({ turnaroundMs: 3 }));
        right.record(sample({ turnaroundMs: 40 }));
        right.record(sample({ status: 'features' }));

        const merged = mergeGenerationStats([left.snapshot(), right.snapshot()]);
        const full = merged.byTask.find((entry) => entry.status === 'full')!;
        expect(merged.byTask).toHaveLength(2);
        expect(full.tasks).toBe(2);
        expect(full.turnaround.maxMs).toBe(40);
        expect(full.turnaround.totalMs).toBe(43);
    });
});
