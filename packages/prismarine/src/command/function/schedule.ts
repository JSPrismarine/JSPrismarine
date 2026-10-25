/**
 * The queue `/schedule` puts a function on, which is Java's `TimerQueue`.
 *
 * Entries are keyed by the text `/schedule` named the function with, tag `#`
 * and all, because that is what `/schedule clear` is given and what Java
 * matches on: scheduling `#my:tag` and then clearing `my:tag` clears nothing.
 *
 * `replace`, the default, means at most one pending entry per name - a
 * function that reschedules itself every tick stays one entry rather than
 * growing a queue. `append` lets the same name wait several times over.
 */

/** One pending call. */
interface ScheduledCall {
    /** The reference `/schedule` was given: a function id, or `#tag`. */
    readonly reference: string;
    /** The tick it comes due on. */
    readonly due: number;
}

/** What one `/schedule` line asks for. */
export type ScheduleMode = 'append' | 'replace';

/** Pending `/schedule` calls, ordered by when they come due. */
export class FunctionSchedule {
    private readonly pending: ScheduledCall[] = [];

    /** Ticks elapsed since the queue was built, which is what `due` is measured in. */
    private elapsed = 0;

    /** How many calls are waiting. */
    public get size(): number {
        return this.pending.length;
    }

    /** Every pending reference, in the order the calls come due. */
    public references(): readonly string[] {
        return this.pending.map((call) => call.reference);
    }

    /**
     * Queues a call.
     *
     * @param delayTicks - How many ticks from now, as `/schedule` counts them.
     *   Zero means the next tick, because a schedule is never run inside the
     *   tick that made it.
     * @param mode - `replace` drops whatever was already pending under the
     *   same reference; `append` leaves it.
     */
    public add(reference: string, delayTicks: number, mode: ScheduleMode): void {
        if (mode === 'replace') this.clear(reference);

        const due = this.elapsed + Math.max(1, Math.trunc(delayTicks));
        const at = this.pending.findIndex((call) => call.due > due);
        const entry = { reference, due };
        if (at < 0) this.pending.push(entry);
        else this.pending.splice(at, 0, entry);
    }

    /**
     * Drops every pending call of one reference.
     *
     * @returns How many were dropped.
     */
    public clear(reference: string): number {
        let removed = 0;
        for (let index = this.pending.length - 1; index >= 0; index -= 1) {
            if (this.pending[index]?.reference !== reference) continue;
            this.pending.splice(index, 1);
            removed += 1;
        }
        return removed;
    }

    /**
     * Advances the clock one tick and takes everything that has come due.
     *
     * Taken rather than run here: the queue decides *when*, and running a
     * function is the runtime's job. Entries come out in the order they were
     * due, and a call one of them schedules lands after the ones already out.
     *
     * @returns The references to run, in order.
     */
    public advance(): readonly string[] {
        this.elapsed += 1;

        let count = 0;
        while (count < this.pending.length && (this.pending[count]?.due ?? Infinity) <= this.elapsed) count += 1;
        return this.pending.splice(0, count).map((call) => call.reference);
    }
}
