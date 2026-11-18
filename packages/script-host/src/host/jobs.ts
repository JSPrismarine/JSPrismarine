/**
 * The queue behind `system.runJob` and `system.clearJob`, in the order the pinned Bedrock
 * Dedicated Server advances jobs, as the `system-jobs` scenario of the parity suite records it:
 *
 * - A job first runs in the tick after the one it was queued in, before that tick's system tasks.
 * - Each tick, every job takes one step, in the order they were queued; then each job, in the
 *   same order, takes steps until it ends or the tick's job budget is spent.
 * - A job that ends, throws or is cleared leaves the queue, and a job cleared while it runs takes
 *   no further step.
 *
 * BDS gives jobs what is left of a tick's time. The budget here is the caller's, counted in
 * interpreter steps, so a replay advances every job just as far
 * ([ADR 0021](../../../../docs/adr/0021-the-script-watchdog-counts-steps.md)).
 *
 * It holds the jobs as values of its own type, so it needs no engine and its order is tested on
 * its own.
 */

/** What one step of a job did: there is more to do, or the job is over. */
export type JobStep = 'more' | 'done';

/** The queue of one script runtime's jobs. */
export class JobQueue<Job> {
    private readonly jobs = new Map<number, Job>();
    private nextId = 1;

    /**
     * Queues a job, which first runs in the next call to {@link JobQueue.run}.
     * @returns The job's id. Ids count from 1 for the whole runtime.
     */
    public add(job: Job): number {
        const id = this.nextId++;
        this.jobs.set(id, job);
        return id;
    }

    /**
     * Takes a job out of the queue.
     * @returns The job, for the caller to release, or undefined when no job has the id.
     */
    public clear(id: number): Job | undefined {
        const job = this.jobs.get(id);
        this.jobs.delete(id);
        return job;
    }

    /** How many jobs are queued. */
    public get size(): number {
        return this.jobs.size;
    }

    /**
     * Advances the jobs one tick.
     * @param step - Takes one step of a job. A job that throws is over, and `step` reports it as `done`.
     * @param withinBudget - Whether another step fits in the tick's job budget, asked before each
     *   step after the first round.
     * @param release - Called once with each job that is over.
     * @returns How many steps ran.
     */
    public run(step: (job: Job) => JobStep, withinBudget: () => boolean, release: (job: Job) => void): number {
        // Jobs a running job queues wait for the next tick.
        const ids = [...this.jobs.keys()];
        let steps = 0;
        const advance = (id: number): JobStep | undefined => {
            const job = this.jobs.get(id);
            if (job === undefined) return undefined;
            steps++;
            const result = step(job);
            if (result === 'done' && this.jobs.get(id) === job) {
                this.jobs.delete(id);
                release(job);
            }
            return result;
        };
        for (const id of ids) advance(id);
        for (const id of ids) {
            while (this.jobs.has(id) && withinBudget()) advance(id);
        }
        return steps;
    }

    /** Empties the queue, releasing every job. */
    public dispose(release: (job: Job) => void): void {
        for (const job of this.jobs.values()) release(job);
        this.jobs.clear();
    }
}
