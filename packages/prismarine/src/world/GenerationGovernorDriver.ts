import { CgroupThrottleSampler, ConcurrencyGovernor } from '@jsprismarine/chunkgen';

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
}

/** How often the control group's throttle counter is read, in milliseconds. */
const THROTTLE_SAMPLE_INTERVAL_MS = 1000;

/**
 * Connects the concurrency governor to the server: tick lateness and the control group's
 * throttle counter go in, a limit on background generation tasks comes out.
 */
export class GenerationGovernorDriver {
    private readonly governor: ConcurrencyGovernor;
    private readonly sampler: Pick<CgroupThrottleSampler, 'sample'>;
    private readonly now: () => number;
    private stop: (() => void) | undefined;
    private applied: number | undefined;
    private lastSampleAt = Number.NEGATIVE_INFINITY;
    private throttledSince = 0;

    public constructor(private readonly options: GenerationGovernorDriverOptions) {
        this.governor = new ConcurrencyGovernor({ max: options.workers });
        this.sampler = options.sampler ?? new CgroupThrottleSampler();
        this.now = options.now ?? (() => performance.now());
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
            const limit = this.governor.observe({ latenessMs: sample.latenessMs, throttledDelta }, now);

            // Applied when it changes, and again when a pool appears that has not seen it.
            const control = this.options.control();
            if (control === undefined || this.applied === limit) return;
            control.setBackgroundLimit(limit);
            this.applied = limit;
        });
    }

    /** Stops listening and lifts the limit. */
    public close(): void {
        this.stop?.();
        this.stop = undefined;
        this.options.control()?.setBackgroundLimit(undefined);
        this.applied = undefined;
    }
}
