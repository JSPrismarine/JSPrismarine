/**
 * What a generation pool records about the tasks it ran.
 *
 * A task spends time in three places: in the pool's backlog waiting for a free slot, in the
 * worker, and between the two, where it sits behind the main thread's event loop. They answer
 * different questions. Backlog wait is how long a caller was made to wait by admission control.
 * Worker wall time is the task's own length, which is what decides whether a long task can hold
 * up an arriving `immediate` one. Turnaround minus worker wall time is what the dispatcher costs.
 * Worker CPU time is the denominator of chunks per CPU-second.
 *
 * Durations land in fixed buckets so a snapshot stays small and two snapshots merge by adding.
 */
import type { ChunkStatus } from './ChunkStatus';
import type { GenerationPriority } from './GenerationPool';

/**
 * Upper bounds of the duration buckets, in milliseconds. A final bucket past the last bound
 * holds everything longer. The 10 ms bound is deliberate: tasks longer than it are the ones
 * that can make an arriving `immediate` task wait noticeably.
 */
export const DURATION_BUCKET_BOUNDS_MS = [1, 2, 5, 10, 20, 50, 100, 250, 1000] as const;

/** The count, total, maximum and bucketed distribution of one duration. */
export interface DurationSummary {
    readonly count: number;
    readonly totalMs: number;
    readonly maxMs: number;
    /** One count per {@link DURATION_BUCKET_BOUNDS_MS} bound, then one for everything longer. */
    readonly buckets: readonly number[];
}

/** Tasks of one status in one priority band. */
export interface GenerationTaskStats {
    readonly status: ChunkStatus;
    readonly priority: GenerationPriority;
    /** Tasks that settled, successfully or not. */
    readonly tasks: number;
    /** Tasks that settled with an error. */
    readonly failed: number;
    /** Time in the pool's backlog before a worker slot was free. */
    readonly backlogWait: DurationSummary;
    /** From leaving the backlog to the result arriving on this thread. */
    readonly turnaround: DurationSummary;
    /** The task's own wall time inside the worker. Only tasks that reported it count here. */
    readonly workerWall: DurationSummary;
    /** Thread CPU time inside the worker, in the same sense as {@link workerWall}. */
    readonly workerCpu: DurationSummary;
}

/** A point-in-time copy of everything a pool recorded. */
export interface GenerationStatsSnapshot {
    readonly byTask: readonly GenerationTaskStats[];
}

/** One settled task, as the pool saw it. */
export interface GenerationTaskSample {
    readonly status: ChunkStatus;
    readonly priority: GenerationPriority;
    readonly failed: boolean;
    readonly backlogWaitMs: number;
    readonly turnaroundMs: number;
    /** Absent when the worker did not say, which is every runner that predates the field. */
    readonly workerWallMs?: number;
    readonly workerCpuMs?: number;
}

/** What a worker reports about one task it ran, in microseconds. */
export interface WorkerTaskStats {
    readonly wallUs: number;
    readonly cpuUs: number;
}

interface MutableDuration {
    count: number;
    totalMs: number;
    maxMs: number;
    buckets: number[];
}

const emptyDuration = (): MutableDuration => ({
    count: 0,
    totalMs: 0,
    maxMs: 0,
    buckets: new Array<number>(DURATION_BUCKET_BOUNDS_MS.length + 1).fill(0)
});

const addDuration = (into: MutableDuration, ms: number): void => {
    const value = Math.max(0, ms);
    into.count++;
    into.totalMs += value;
    into.maxMs = Math.max(into.maxMs, value);
    const bucket = DURATION_BUCKET_BOUNDS_MS.findIndex((bound) => value <= bound);
    into.buckets[bucket === -1 ? DURATION_BUCKET_BOUNDS_MS.length : bucket]!++;
};

interface MutableTaskStats {
    readonly status: ChunkStatus;
    readonly priority: GenerationPriority;
    tasks: number;
    failed: number;
    backlogWait: MutableDuration;
    turnaround: MutableDuration;
    workerWall: MutableDuration;
    workerCpu: MutableDuration;
}

/** Records settled tasks by status and priority band. */
export class GenerationStatsRecorder {
    private readonly byKey = new Map<string, MutableTaskStats>();

    /** Adds one settled task. */
    public record(sample: GenerationTaskSample): void {
        const key = `${sample.status}/${sample.priority}`;
        let entry = this.byKey.get(key);
        if (entry === undefined) {
            entry = {
                status: sample.status,
                priority: sample.priority,
                tasks: 0,
                failed: 0,
                backlogWait: emptyDuration(),
                turnaround: emptyDuration(),
                workerWall: emptyDuration(),
                workerCpu: emptyDuration()
            };
            this.byKey.set(key, entry);
        }

        entry.tasks++;
        if (sample.failed) entry.failed++;
        addDuration(entry.backlogWait, sample.backlogWaitMs);
        addDuration(entry.turnaround, sample.turnaroundMs);
        if (sample.workerWallMs !== undefined) addDuration(entry.workerWall, sample.workerWallMs);
        if (sample.workerCpuMs !== undefined) addDuration(entry.workerCpu, sample.workerCpuMs);
    }

    /** Copies the current figures, leaving the recorder running. */
    public snapshot(): GenerationStatsSnapshot {
        const copy = (duration: MutableDuration): DurationSummary => ({ ...duration, buckets: [...duration.buckets] });

        return {
            byTask: [...this.byKey.values()].map((entry) => ({
                status: entry.status,
                priority: entry.priority,
                tasks: entry.tasks,
                failed: entry.failed,
                backlogWait: copy(entry.backlogWait),
                turnaround: copy(entry.turnaround),
                workerWall: copy(entry.workerWall),
                workerCpu: copy(entry.workerCpu)
            }))
        };
    }

    /** Forgets everything recorded so far. */
    public reset(): void {
        this.byKey.clear();
    }
}

const mergeDuration = (left: DurationSummary, right: DurationSummary): DurationSummary => ({
    count: left.count + right.count,
    totalMs: left.totalMs + right.totalMs,
    maxMs: Math.max(left.maxMs, right.maxMs),
    buckets: left.buckets.map((count, index) => count + (right.buckets[index] ?? 0))
});

/** Adds snapshots together, so a pool made of shards reports as one. */
export const mergeGenerationStats = (snapshots: readonly GenerationStatsSnapshot[]): GenerationStatsSnapshot => {
    const merged = new Map<string, GenerationTaskStats>();
    for (const snapshot of snapshots) {
        for (const entry of snapshot.byTask) {
            const key = `${entry.status}/${entry.priority}`;
            const existing = merged.get(key);
            merged.set(
                key,
                existing === undefined
                    ? entry
                    : {
                          status: entry.status,
                          priority: entry.priority,
                          tasks: existing.tasks + entry.tasks,
                          failed: existing.failed + entry.failed,
                          backlogWait: mergeDuration(existing.backlogWait, entry.backlogWait),
                          turnaround: mergeDuration(existing.turnaround, entry.turnaround),
                          workerWall: mergeDuration(existing.workerWall, entry.workerWall),
                          workerCpu: mergeDuration(existing.workerCpu, entry.workerCpu)
                      }
            );
        }
    }

    return { byTask: [...merged.values()] };
};

/** The share of a duration's samples longer than a bucket bound, or 0 with no samples. */
export const shareLongerThan = (
    duration: DurationSummary,
    boundMs: (typeof DURATION_BUCKET_BOUNDS_MS)[number]
): number => {
    if (duration.count === 0) return 0;
    const first = DURATION_BUCKET_BOUNDS_MS.indexOf(boundMs) + 1;
    let longer = 0;
    for (let index = first; index < duration.buckets.length; index++) longer += duration.buckets[index]!;

    return longer / duration.count;
};
