/**
 * What the tick loop remembers about its recent ticks.
 *
 * Lateness is the gap between when a tick was due and when it started, which is what a player
 * feels: the loop is a fixed-epoch schedule, so a tick that starts late has either followed a
 * tick that ran long or waited behind other work on the event loop. A tick's own duration says
 * how long it held the thread, and its phases say where the time went, so a late tick can be
 * attributed to the phase that dominated the tick before it or to the event loop around it.
 */

/** The phases of one tick the loop already times. */
export interface TickPhaseTimes {
    readonly tickHandlersMs: number;
    readonly worldUpdatesMs: number;
    readonly chunkCompletionsMs: number;
    readonly chunkSchedulerMs: number;
}

/** One tick, as the loop saw it. */
export interface TickSample extends TickPhaseTimes {
    readonly tick: number;
    /** How long past its due time the tick started. */
    readonly latenessMs: number;
    /** From start to finish of the tick's own work. */
    readonly elapsedMs: number;
}

/** Where late-tick time went, by the phase that took the longest in the tick. */
export type TickCause = keyof TickPhaseTimes | 'other';

/** The distribution of a run of ticks. */
export interface TickSummary {
    readonly ticks: number;
    readonly elapsedMs: { readonly mean: number; readonly p50: number; readonly p99: number; readonly max: number };
    readonly latenessMs: { readonly mean: number; readonly p50: number; readonly p99: number; readonly max: number };
    /** Ticks whose own work took longer than the 50 ms period, by the phase that took longest. */
    readonly overrunCauses: Readonly<Record<TickCause, number>>;
}

/** The p-th percentile of values by the nearest-rank method, or 0 with none. */
export const percentileOf = (values: readonly number[], p: number): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const rank = Math.ceil((p / 100) * sorted.length);

    return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]!;
};

const describeDistribution = (values: readonly number[]) => ({
    mean: values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length,
    p50: percentileOf(values, 50),
    p99: percentileOf(values, 99),
    max: values.reduce((max, value) => Math.max(max, value), 0)
});

const PHASES = ['tickHandlersMs', 'worldUpdatesMs', 'chunkCompletionsMs', 'chunkSchedulerMs'] as const;

/** Summarizes ticks, attributing each tick that overran `periodMs` to its longest phase. */
export const summarizeTicks = (samples: readonly TickSample[], periodMs = 50): TickSummary => {
    const overrunCauses: Record<TickCause, number> = {
        tickHandlersMs: 0,
        worldUpdatesMs: 0,
        chunkCompletionsMs: 0,
        chunkSchedulerMs: 0,
        other: 0
    };
    for (const sample of samples) {
        if (sample.elapsedMs <= periodMs) continue;

        const timed = PHASES.reduce((total, phase) => total + sample[phase], 0);
        // Time outside the timed phases is the tick's own bookkeeping and the functions pass.
        let cause: TickCause = 'other';
        let longest = Math.max(0, sample.elapsedMs - timed);
        for (const phase of PHASES) {
            if (sample[phase] > longest) {
                longest = sample[phase];
                cause = phase;
            }
        }
        overrunCauses[cause]++;
    }

    return {
        ticks: samples.length,
        elapsedMs: describeDistribution(samples.map((sample) => sample.elapsedMs)),
        latenessMs: describeDistribution(samples.map((sample) => sample.latenessMs)),
        overrunCauses
    };
};

/** A bounded ring of the most recent ticks. */
export class TickRecorder {
    private readonly samples: TickSample[] = [];
    private next = 0;

    public constructor(private readonly capacity = 8192) {}

    /** Remembers one tick, forgetting the oldest once the ring is full. */
    public record(sample: TickSample): void {
        this.samples[this.next] = sample;
        this.next = (this.next + 1) % this.capacity;
    }

    /** The remembered ticks from `firstTick` up to but not including `endTick`, oldest first. */
    public between(firstTick: number, endTick = Number.POSITIVE_INFINITY): readonly TickSample[] {
        const ordered =
            this.samples.length < this.capacity
                ? this.samples
                : [...this.samples.slice(this.next), ...this.samples.slice(0, this.next)];

        return ordered.filter((sample) => sample.tick >= firstTick && sample.tick < endTick);
    }
}
