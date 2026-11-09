import { describe, expect, it } from 'vitest';

import { TickRecorder } from '../profiling/TickRecorder';
import type { TickSample } from '../profiling/TickRecorder';
import { GenerationGovernorDriver } from './GenerationGovernorDriver';
import type { GenerationControl } from './Generator';

const sample = (tick: number, latenessMs: number): TickSample => ({
    tick,
    latenessMs,
    elapsedMs: 10,
    tickHandlersMs: 1,
    worldUpdatesMs: 1,
    chunkCompletionsMs: 1,
    chunkSchedulerMs: 1
});

/** A control that remembers the limits it was given. */
const recordingControl = () => {
    const limits: (number | undefined)[] = [];
    const control: GenerationControl = {
        setBackgroundLimit: (limit) => limits.push(limit),
        cancelQueued: () => 0,
        outstanding: () => 0,
        stats: () => ({ byTask: [] }),
        resetStats: () => {}
    };

    return { control, limits };
};

describe('GenerationGovernorDriver', () => {
    it('runs a calm period, a burst of late ticks and a recovery against a fake clock', () => {
        const recorder = new TickRecorder();
        const { control, limits } = recordingControl();
        let now = 0;
        const driver = new GenerationGovernorDriver({
            recorder,
            workers: 8,
            control: () => control,
            sampler: { sample: () => 0 },
            now: () => now
        });
        driver.start();
        let tick = 0;
        const step = (latenessMs: number, advanceMs = 50) => {
            now += advanceMs;
            recorder.record(sample(tick++, latenessMs));
        };

        // Calm: starts at half of the seven background slots and climbs one step per second.
        for (let index = 0; index < 30; index++) step(1);
        expect(limits[0]).toBe(3);
        expect(driver.active).toBe(4);

        // A burst of late ticks cuts it sharply.
        for (let index = 0; index < 3; index++) step(120);
        expect(driver.active).toBe(1);
        expect(limits.at(-1)).toBe(1);

        // Recovery is slow: the hold-off passes, then one step per calm second.
        for (let index = 0; index < 120; index++) step(1);
        expect(driver.active).toBeGreaterThan(1);
        expect(driver.active).toBeLessThanOrEqual(7);
    });

    it('treats growth of the control group throttle counter as pressure', () => {
        const recorder = new TickRecorder();
        const { control } = recordingControl();
        let now = 0;
        let throttled = 0;
        const driver = new GenerationGovernorDriver({
            recorder,
            workers: 8,
            control: () => control,
            sampler: { sample: () => throttled },
            now: () => now
        });
        driver.start();

        now += 2000;
        recorder.record(sample(0, 0));
        const calm = driver.active;
        throttled = 5;
        now += 1000;
        recorder.record(sample(1, 0));

        expect(driver.active).toBeLessThan(calm);
    });

    it('waits for the pool to exist before applying a limit, then applies the current one', () => {
        const recorder = new TickRecorder();
        const { control, limits } = recordingControl();
        let present = false;
        let now = 0;
        const driver = new GenerationGovernorDriver({
            recorder,
            workers: 6,
            control: () => (present ? control : undefined),
            sampler: { sample: () => 0 },
            now: () => now
        });
        driver.start();

        now += 50;
        recorder.record(sample(0, 1));
        expect(limits).toEqual([]);
        present = true;
        now += 50;
        recorder.record(sample(1, 1));
        expect(limits).toEqual([2]);
    });

    it('lifts the limit when closed', () => {
        const recorder = new TickRecorder();
        const { control, limits } = recordingControl();
        const driver = new GenerationGovernorDriver({
            recorder,
            workers: 4,
            control: () => control,
            sampler: { sample: () => 0 }
        });
        driver.start();
        driver.close();

        expect(limits.at(-1)).toBeUndefined();
        recorder.record(sample(0, 500));
        expect(limits).toHaveLength(1);
    });
});
