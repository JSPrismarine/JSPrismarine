import type { GenerationPriority } from '@jsprismarine/chunkgen';
import { profileCounterRecorder } from '../profiling/ServerProfiler';

/** A deferred chunk completion, with the work class used for fair service. */
interface Completion {
    readonly run: () => boolean;
    readonly queuedAt: number;
    readonly label: string;
    readonly key: string | undefined;
    priority: GenerationPriority;
}

/** Work counted separately so a profile can distinguish translation from lighting. */
export interface CompletionWorkStats {
    readonly completed: number;
    readonly cpuMs: number;
    readonly maxQueueAgeMs: number;
}

/** A read-only view of recent and cumulative queue pressure. */
export interface ChunkCompletionQueueSnapshot {
    readonly pending: number;
    readonly enqueued: number;
    readonly completed: number;
    readonly rejected: number;
    readonly cpuMs: number;
    readonly oldestAgeMs: number;
    readonly maxQueueAgeMs: number;
    readonly maxTaskCpuMs: number;
    readonly peakPending: number;
    readonly byLabel: Readonly<Record<string, CompletionWorkStats>>;
}

/** The worker result and loaded-chunk work the ticker may defer. */
export interface ChunkCompletionScheduler {
    /** Runs now while the ticker is inactive, or settles when the ticker drains the queued work. */
    defer<T>(work: () => T, options?: { priority?: GenerationPriority; label?: string; key?: string }): Promise<T>;

    /** Raises queued work when a background chunk becomes a player-visible request. */
    promote(key: string, priority: GenerationPriority): boolean;
}

/** The completion slice is independent from the time reserved for sending chunk packets. */
export const DEFAULT_CHUNK_COMPLETION_BUDGET_MS = 2;

/**
 * Fair, time-bounded work behind chunk completion.
 *
 * Promise reactions from worker pools can finish in a large burst. This queue keeps expensive
 * promotion and lighting work out of that burst, then spends a separate slice on it each tick.
 * A weighted lane rotation keeps idle completions moving during a join burst, while preserving
 * FIFO order within each urgency band. One task always runs when work is pending; synchronous
 * tasks cannot be preempted, so the budget can be exceeded by at most that task's duration.
 */
export class ChunkCompletionQueue implements ChunkCompletionScheduler {
    // Three of every five turns serve player-visible work; reserving one each for background and
    // idle work prevents either lane from starving during a continuous join burst.
    private static readonly lanes: readonly GenerationPriority[] = [
        'immediate',
        'immediate',
        'soon',
        'immediate',
        'idle'
    ];

    private readonly waiting = new Map<GenerationPriority, Completion[]>([
        ['immediate', []],
        ['soon', []],
        ['idle', []]
    ]);

    private readonly keyed = new Map<string, Completion>();
    private active = false;
    private laneCursor = 0;
    private pendingCount = 0;
    private enqueued = 0;
    private completed = 0;
    private rejected = 0;
    private cpuMs = 0;
    private maxQueueAgeMs = 0;
    private maxTaskCpuMs = 0;
    private peakPending = 0;
    private readonly byLabel = new Map<string, { completed: number; cpuMs: number; maxQueueAgeMs: number }>();

    public constructor(private readonly now: () => number = () => performance.now()) {}

    /** Whether completions currently wait for the ticker. */
    public get isActive(): boolean {
        return this.active;
    }

    /** Number of completion callbacks waiting for a tick. */
    public get pending(): number {
        return this.pendingCount;
    }

    /** Defers one synchronous completion, preserving its result or error for the caller. */
    public defer<T>(
        work: () => T,
        {
            priority = 'immediate',
            label = 'chunk',
            key
        }: {
            priority?: GenerationPriority;
            label?: string;
            key?: string;
        } = {}
    ): Promise<T> {
        if (!this.active) {
            try {
                return Promise.resolve(work());
            } catch (error: unknown) {
                return Promise.reject(error);
            }
        }

        return new Promise<T>((resolve, reject) => {
            const completion: Completion = {
                queuedAt: this.now(),
                priority,
                label,
                key,
                run: () => {
                    try {
                        resolve(work());
                        return true;
                    } catch (error: unknown) {
                        reject(error);
                        return false;
                    }
                }
            };

            this.waiting.get(priority)!.push(completion);
            if (key !== undefined) this.keyed.set(key, completion);
            this.pendingCount++;
            this.enqueued++;
            this.peakPending = Math.max(this.peakPending, this.pendingCount);
        });
    }

    /** Starts tick-bounded completion processing. */
    public activate(): void {
        this.active = true;
    }

    /** Stops deferring work and settles the queue before world teardown or a disabled tick loop. */
    public deactivate(): void {
        this.active = false;
        while (this.pendingCount > 0) this.runNext();
    }

    /**
     * Drains completions up to a wall-clock budget, running one task even if it overruns.
     *
     * @param budgetMs - The portion of one tick reserved for non-gameplay completion work.
     * @returns How many tasks ran.
     */
    public drain(budgetMs: number): number {
        const startedAt = this.now();
        let drained = 0;

        while (this.pendingCount > 0 && (drained === 0 || this.now() - startedAt < budgetMs)) {
            this.runNext();
            drained++;
        }

        this.recordProfileCounters();
        return drained;
    }

    /** Moves background work to a new lane, or runs a player-visible completion immediately. */
    public promote(key: string, priority: GenerationPriority): boolean {
        const completion = this.keyed.get(key);
        if (completion === undefined) return false;

        const order = ['immediate', 'soon', 'idle'] as const;
        if (priority !== 'immediate' && order.indexOf(priority) >= order.indexOf(completion.priority)) return false;

        const source = this.waiting.get(completion.priority)!;
        source.splice(source.indexOf(completion), 1);
        if (priority === 'immediate') {
            // The caller can be awaiting this chunk from inside the current world tick. If it
            // waited for the next drain, the tick would be unable to finish and schedule one.
            this.pendingCount--;
            if (completion.key !== undefined && this.keyed.get(completion.key) === completion) {
                this.keyed.delete(completion.key);
            }
            this.runCompletion(completion);
            return true;
        }

        completion.priority = priority;
        this.waiting.get(priority)!.push(completion);
        return true;
    }

    /** Captures queue age and event-loop work for an operational profile or regression test. */
    public snapshot(): ChunkCompletionQueueSnapshot {
        const now = this.now();
        let oldestQueuedAt = now;
        for (const tasks of this.waiting.values()) {
            for (const task of tasks) oldestQueuedAt = Math.min(oldestQueuedAt, task.queuedAt);
        }

        return {
            pending: this.pendingCount,
            enqueued: this.enqueued,
            completed: this.completed,
            rejected: this.rejected,
            cpuMs: this.cpuMs,
            oldestAgeMs: this.pendingCount === 0 ? 0 : now - oldestQueuedAt,
            maxQueueAgeMs: this.maxQueueAgeMs,
            maxTaskCpuMs: this.maxTaskCpuMs,
            peakPending: this.peakPending,
            byLabel: Object.fromEntries([...this.byLabel].map(([label, stats]) => [label, { ...stats }]))
        };
    }

    private runNext(): void {
        const completion = this.takeNext();
        if (completion === undefined) return;

        this.pendingCount--;
        if (completion.key !== undefined && this.keyed.get(completion.key) === completion) {
            this.keyed.delete(completion.key);
        }

        this.runCompletion(completion);
    }

    private runCompletion(completion: Completion): void {
        const queueAgeMs = this.now() - completion.queuedAt;
        const startedAt = this.now();
        const succeeded = completion.run();
        const taskCpuMs = this.now() - startedAt;
        const labelStats = this.byLabel.get(completion.label) ?? { completed: 0, cpuMs: 0, maxQueueAgeMs: 0 };
        labelStats.completed++;
        labelStats.cpuMs += taskCpuMs;
        labelStats.maxQueueAgeMs = Math.max(labelStats.maxQueueAgeMs, queueAgeMs);
        this.byLabel.set(completion.label, labelStats);

        this.completed++;
        if (!succeeded) this.rejected++;
        this.cpuMs += taskCpuMs;
        this.maxTaskCpuMs = Math.max(this.maxTaskCpuMs, taskCpuMs);
        this.maxQueueAgeMs = Math.max(this.maxQueueAgeMs, queueAgeMs);
    }

    private recordProfileCounters(): void {
        const record = profileCounterRecorder(this);
        if (record === undefined) return;

        const snapshot = this.snapshot();
        const workerResults = snapshot.byLabel['worker-result'];
        const lighting = snapshot.byLabel['chunk-lighting'];
        record('Server.chunkCompletions.queue', {
            pending: snapshot.pending,
            completed: snapshot.completed,
            rejected: snapshot.rejected,
            cpuMs: snapshot.cpuMs,
            oldestAgeMs: snapshot.oldestAgeMs,
            maxQueueAgeMs: snapshot.maxQueueAgeMs,
            workerResults: workerResults?.completed ?? 0,
            workerResultCpuMs: workerResults?.cpuMs ?? 0,
            chunkLighting: lighting?.completed ?? 0,
            chunkLightingCpuMs: lighting?.cpuMs ?? 0,
            peakPending: snapshot.peakPending
        });
    }

    private takeNext(): Completion | undefined {
        for (let offset = 0; offset < ChunkCompletionQueue.lanes.length; offset++) {
            const laneIndex = (this.laneCursor + offset) % ChunkCompletionQueue.lanes.length;
            const lane = ChunkCompletionQueue.lanes[laneIndex]!;
            const completion = this.waiting.get(lane)!.shift();
            if (completion === undefined) continue;

            this.laneCursor = (laneIndex + 1) % ChunkCompletionQueue.lanes.length;
            return completion;
        }

        return undefined;
    }
}
