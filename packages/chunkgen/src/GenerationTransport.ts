/**
 * What a caller holds to get generation tasks run.
 *
 * Two implementations share it: {@link GenerationPool} runs workers inside this process, and
 * {@link HostedGenerationPool} runs them in a child process whose operating system priority the
 * server can lower. A caller that holds the interface does not know which it has, and the
 * output cannot depend on it, because every task is a pure function of its inputs.
 */
import type { GenerationPriority, GenerationResult, GenerationTask, PauseRule } from './GenerationPool';
import type { GenerationStatsSnapshot } from './GenerationStats';

/** The surface a generation pool offers its callers. */
export interface GenerationTransport {
    /** How many workers are up. */
    readonly workers: number;
    /** How many tasks the workers are holding right now. */
    readonly inFlight: number;
    /** How many tasks are waiting for a worker. */
    readonly queued: number;

    /**
     * Runs one task in a worker.
     *
     * @param task - The status, the position and whatever else the body reads.
     * @param priority - Which band the task waits in. Defaults to `immediate`.
     * @returns What the body produced.
     */
    run(task: GenerationTask, priority?: GenerationPriority): Promise<GenerationResult>;

    /** Drops every waiting task a predicate rejects. @returns How many went. */
    cancel(wanted: (task: GenerationTask) => boolean): number;

    /** Moves waiting tasks up into a band. @returns How many moved. */
    promote(wanted: (task: GenerationTask) => boolean, to: GenerationPriority): number;

    /** What the transport recorded about the tasks it ran. */
    statsSnapshot(): GenerationStatsSnapshot;

    /** Forgets the recorded stats. */
    resetStats(): void;

    /** Holds the tasks a rule picks out back from the workers; see {@link GenerationPool.pause}. */
    pause(rule?: PauseRule): void;

    /** Lets held tasks flow again. */
    resume(): void;

    /**
     * Limits how many `soon` and `idle` tasks may be with workers at once, which is what the
     * concurrency governor steers. `immediate` tasks are never limited.
     */
    setBackgroundLimit(limit: number | undefined): void;

    /** Stops every worker and refuses what is waiting. */
    destroy(): Promise<void>;
}
