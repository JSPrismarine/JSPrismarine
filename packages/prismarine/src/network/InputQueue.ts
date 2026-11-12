/**
 * The most inputs one input step applies. A count, so a backlog costs a slow host the same ticks
 * it costs a fast one; whatever is left waits for the next step, in order. The same number as the
 * worker transport's bound on the records it hands the game thread in one tick.
 */
export const INPUT_ADMISSION_BUDGET_PER_TICK = 4096;

/** One held input: the work that applies it, and the caller waiting for that work to finish. */
interface HeldInput {
    readonly apply: () => void;
    readonly resolve: () => void;
    readonly reject: (error: unknown) => void;
}

/**
 * Inputs that arrived between ticks, held until the next input step applies them in arrival order
 * ([ADR 0009](../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md)).
 *
 * An input-lane packet and a player's removal are inputs. Holding one returns a promise that
 * settles once the input step that applied it is over, so work that waits on it runs after every
 * input of that step, and never between two of them.
 *
 * The server keeps one queue and drains it once at the start of a tick, before the first level
 * updates. The levels tick one after another, so that is the input step of every world. When the
 * worlds tick apart, each world takes a queue of its own and the dispatcher holds an input on the
 * queue of the world its sender's entity is in.
 */
export class InputQueue {
    private held: HeldInput[] = [];

    /** How many inputs wait for an input step. */
    public get pending(): number {
        return this.held.length;
    }

    /**
     * Holds one input for the next input step.
     *
     * @param apply - Applies the input, to its end, in one call. It runs inside the input step,
     *   after every input held before it has been applied.
     * @returns Settles as `apply` returned or threw, once the input step that ran it has applied
     *   every input it took.
     */
    public hold(apply: () => void): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.held.push({ apply, resolve, reject });
        });
    }

    /**
     * The input step: applies held inputs in arrival order, each to its end before the next, in
     * one call that waits for nothing.
     *
     * The step takes the inputs held when it begins, up to `budget` of them. An input held while
     * the step runs, such as one a handler in the step holds, waits for the next step, so which step applies an input never depends on how fast
     * the inputs before it ran. A failing input settles its own caller with its error and does not
     * stop the step. The callers settle once the last input of the step has been applied, so
     * nothing that waits on one input runs while the step is still applying the others.
     *
     * @param budget - The most inputs this step applies.
     * @returns How many inputs this step applied.
     */
    public admit(budget = INPUT_ADMISSION_BUDGET_PER_TICK): number {
        const step = this.held.splice(0, Math.max(0, budget));
        const settles: (() => void)[] = [];
        for (const input of step) {
            try {
                input.apply();
                settles.push(input.resolve);
            } catch (error: unknown) {
                settles.push(() => input.reject(error));
            }
        }
        for (const settle of settles) settle();
        return step.length;
    }
}
