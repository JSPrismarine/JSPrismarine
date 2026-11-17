/**
 * The queue behind `system.run`, `system.runTimeout` and `system.runInterval`, in the order the
 * pinned Bedrock Dedicated Server runs them, as the `system-tasks` scenario of the parity suite
 * records it:
 *
 * - A task runs in the script flush of the tick it is due, and the tasks due in one tick run in
 *   the order they were queued, which is the order of their ids.
 * - `runTimeout(callback, 0)`, and one without a delay, is due in the tick it was queued in,
 *   even when a running task queued it, so it runs later in the same pass.
 * - `run` is due in the tick it was queued in, except when a running task queued it: then it
 *   waits for the next tick, which is what stops a task that queues itself from running for ever
 *   in one tick.
 * - `runInterval` first runs after its interval, a 0 or missing interval counting as 0, and then
 *   every interval ticks, at least one.
 *
 * Ids count from 1 for the whole runtime, across packs, as BDS hands them out.
 *
 * It holds the callbacks as values of its own type, so it needs no engine and its order is
 * tested on its own.
 */

import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

/** One queued task. */
export interface ScriptTask<Callback> {
    readonly id: number;
    readonly callback: Callback;
    /** The tick it is due in. */
    readonly due: number;
    /** For an interval, the ticks between its runs; undefined for a task that runs once. */
    readonly interval?: number;
}

/** The kind of call that queued a task. */
export type TaskKind = 'run' | 'timeout' | 'interval';

/** The queue of one script runtime's tasks. */
export class TaskQueue<Callback> {
    private readonly tasks: ScriptTask<Callback>[] = [];
    private nextId = 1;
    private running = false;

    /**
     * Queues a task.
     * @param tick - The current tick.
     * @param delay - `runTimeout`'s delay or `runInterval`'s interval, in ticks; 0 when absent.
     * @returns The task's id.
     * @throws {RangeError} When the delay is NaN or infinite. The Script API's argument check
     * refuses those first, as BDS does, so this only stops a caller that skips it.
     */
    public schedule(kind: TaskKind, callback: Callback, tick: number, delay = 0): number {
        if (!Number.isFinite(delay)) throw new ScriptHostErrors.TaskDelayNotFinite({ delay });
        const id = this.nextId++;
        const wait = Math.max(0, Math.floor(delay));
        const due = kind === 'run' ? tick + (this.running ? 1 : 0) : tick + wait;
        this.insert({ id, callback, due, ...(kind === 'interval' ? { interval: Math.max(1, wait) } : {}) });
        return id;
    }

    /**
     * Takes a task out, so it does not run again.
     * @returns The task, or undefined when no queued task has the id.
     */
    public clear(id: number): ScriptTask<Callback> | undefined {
        const index = this.tasks.findIndex((task) => task.id === id);
        if (index < 0) return undefined;
        return this.tasks.splice(index, 1)[0];
    }

    /** Whether a task is due in a tick. */
    public hasDue(tick: number): boolean {
        const first = this.tasks[0];
        return first !== undefined && first.due <= tick;
    }

    /**
     * Runs every task due in a tick, in order, including the ones the tasks queue for the same
     * tick. An interval is queued again before its callback runs, so the callback can clear it.
     * @param run - Runs one task's callback.
     * @param mayRun - Asked before each task; false leaves it and the rest queued, still due.
     * @returns How many tasks ran.
     */
    public runDue(tick: number, run: (task: ScriptTask<Callback>) => void, mayRun: () => boolean = () => true): number {
        this.running = true;
        let count = 0;
        try {
            for (;;) {
                const task = this.tasks[0];
                if (task === undefined || task.due > tick || !mayRun()) break;
                this.tasks.shift();
                if (task.interval !== undefined) this.insert({ ...task, due: tick + task.interval });
                run(task);
                count++;
            }
        } finally {
            this.running = false;
        }
        return count;
    }

    /** Takes every task out, for a runtime that stops. */
    public drain(): ScriptTask<Callback>[] {
        return this.tasks.splice(0);
    }

    /** Puts a task in its place: by due tick, then by id. */
    private insert(task: ScriptTask<Callback>): void {
        let index = this.tasks.length;
        while (index > 0) {
            const before = this.tasks[index - 1];
            if (before === undefined || before.due < task.due || (before.due === task.due && before.id < task.id)) {
                break;
            }
            index--;
        }
        this.tasks.splice(index, 0, task);
    }
}
