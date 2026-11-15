import { CgroupThrottleSampler, ConcurrencyGovernor } from '@jsprismarine/chunkgen';
import { performance } from 'node:perf_hooks';

import type { TickRecorder } from '../profiling/TickRecorder';
import type { GenerationControl } from './Generator';

/** What the driver is built with. */
export interface GenerationGovernorDriverOptions {
    /** The tick recorder whose lateness steers the limit. */
    readonly recorder: TickRecorder;
    /** The generator's pool handle, asked for on every tick because pools start on first use. */
    readonly control: () => GenerationControl | undefined;
    /** How many workers the pool has, which is the most background tasks ever allowed. */
    readonly workers: number;
    /** The control group throttle sampler. Defaults to the process's own. */
    readonly sampler?: Pick<CgroupThrottleSampler, 'sample'>;
    /** A monotonic clock in milliseconds. */
    readonly now?: () => number;
    /**
     * How busy the server thread has been lately, from 0 to 1. Defaults to the event loop's own
     * utilization over the last one to two seconds.
     */
    readonly utilization?: () => number | undefined;
}

/** How often the control group's throttle counter is read, in milliseconds. */
const THROTTLE_SAMPLE_INTERVAL_MS = 1000;

/**
 * The event loop's utilization over a window of one to two sample intervals: long enough to take
 * in a stall the latest tick started after, short enough to follow the load as it changes.
 */
const eventLoopUtilization = (): (() => number) => {
    let windowStart = performance.eventLoopUtilization();
    let nextStart = windowStart;
    let nextStartAt = performance.now();
    return () => {
        const current = performance.eventLoopUtilization();
        const now = performance.now();
        if (now - nextStartAt >= THROTTLE_SAMPLE_INTERVAL_MS) {
            windowStart = nextStart;
            nextStart = current;
            nextStartAt = now;
        }
        return performance.eventLoopUtilization(current, windowStart).utilization;
    };
};

/**
 * Connects the concurrency governor to the server: tick lateness, how busy the server thread has
 * been and the control group's throttle counter go in, a limit on background generation tasks
 * comes out.
 */
export class GenerationGovernorDriver {
    private readonly governor: ConcurrencyGovernor;
    private readonly sampler: Pick<CgroupThrottleSampler, 'sample'>;
    private readonly now: () => number;
    private readonly utilization: () => number | undefined;
    private stop: (() => void) | undefined;
    private applied: number | undefined;
    private appliedAt = Number.NEGATIVE_INFINITY;
    private lastSampleAt = Number.NEGATIVE_INFINITY;
    private throttledSince = 0;

    public constructor(private readonly options: GenerationGovernorDriverOptions) {
        // Every worker, because the pool keeps one clear of background work by itself whenever an
        // `immediate` task is outstanding; a fixed reserve idled that worker the rest of the time.
        this.governor = new ConcurrencyGovernor({ max: Math.max(1, options.workers) });
        this.sampler = options.sampler ?? new CgroupThrottleSampler();
        this.now = options.now ?? (() => performance.now());
        this.utilization = options.utilization ?? eventLoopUtilization();
    }

    /** The limit the governor currently asks for. */
    public get active(): number {
        return this.governor.active;
    }

    /** Starts listening to ticks. */
    public start(): void {
        this.stop ??= this.options.recorder.subscribe((sample) => {
            const now = this.now();
            if (now - this.lastSampleAt >= THROTTLE_SAMPLE_INTERVAL_MS) {
                this.lastSampleAt = now;
                this.throttledSince += this.sampler.sample() ?? 0;
            }

            const throttledDelta = this.throttledSince;
            this.throttledSince = 0;
            const utilization = this.utilization();
            const limit = this.governor.observe(
                {
                    latenessMs: sample.latenessMs,
                    throttledDelta,
                    ...(utilization === undefined ? {} : { utilization })
                },
                now
            );

            // Applied when it changes, and again every sample interval, because a pool the
            // generator replaces after a failure starts without the limit and nothing else would
            // tell it.
            const control = this.options.control();
            if (control === undefined) return;
            if (this.applied === limit && now - this.appliedAt < THROTTLE_SAMPLE_INTERVAL_MS) return;
            control.setBackgroundLimit(limit);
            this.applied = limit;
            this.appliedAt = now;
        });
    }

    /** Stops listening and lifts the limit. */
    public close(): void {
        this.stop?.();
        this.stop = undefined;
        this.options.control()?.setBackgroundLimit(undefined);
        this.applied = undefined;
        this.appliedAt = Number.NEGATIVE_INFINITY;
    }
}
