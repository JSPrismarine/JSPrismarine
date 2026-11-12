/**
 * The most inputs one input step applies, shared across the sources that hold them. A count, so a
 * backlog costs a slow host the same ticks it costs a fast one; whatever is left waits for the next
 * step, in order. The same number as the worker transport's bound on the records it hands the game
 * thread in one tick.
 */
export const INPUT_ADMISSION_BUDGET_PER_TICK = 4096;

/** One held input: the work that applies it, and the caller waiting for that work to finish. */
interface HeldInput {
    readonly apply: () => void;
    readonly resolve: () => void;
    readonly reject: (error: unknown) => void;
}

/**
 * Inputs that arrived between ticks, held until the next input step applies them
 * ([ADR 0009](../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md)).
 *
 * An input-lane packet and a player's removal are inputs. Each is held under its source, the
 * connection that caused it, and a source's inputs are applied in the order they arrived. Holding
 * one returns a promise that settles once the input step that applied it is over, so work that
 * waits on it runs after every input of that step, and never between two of them.
 *
 * The server keeps one queue and drains it once at the start of a tick, before the first level
 * updates. The levels tick one after another, so that is the input step of every world. When the
 * worlds tick apart, each world takes a queue of its own and the dispatcher holds an input on the
 * queue of the world its sender's entity is in.
 *
 * A server whose tick loop does not run, because ticking is disabled, has no input step to wait
 * for. Its inputs are applied when they arrive, as its chunk completions are
 * (`ChunkAdmissions.hold`), unless something steps its ticks by hand.
 */
export class InputQueue {
    /**
     * Each source's held inputs in arrival order. The map's own order is the order the sources take
     * their turns in a step: a source joins at the end when it holds its first input, and leaves
     * once a step has taken all it held.
     */
    private readonly sources = new Map<unknown, HeldInput[]>();
    private count = 0;
    private applyingOnArrival = false;

    /**
     * @param stepped - Whether an input step will come for what is held: true while the tick loop
     *   runs or a harness steps the ticks by hand. While it is false, an input is applied when it
     *   is held. Read at each hold.
     */
    public constructor(private readonly stepped: () => boolean = () => true) {}

    /** How many inputs wait for an input step. */
    public get pending(): number {
        return this.count;
    }

    /**
     * Holds one input for the next input step, or applies it now when no input step will come.
     *
     * @param source - Who caused the input, compared by identity, such as its connection. Inputs of
     *   one source are applied in the order they were held.
     * @param apply - Applies the input, to its end, in one call. It runs inside the input step,
     *   after every input its source held before it has been applied.
     * @returns Settles as `apply` returned or threw, once the input step that ran it has applied
     *   every input it took.
     */
    public hold(source: unknown, apply: () => void): Promise<void> {
        const applied = new Promise<void>((resolve, reject) => {
            let inputs = this.sources.get(source);
            if (inputs === undefined) {
                inputs = [];
                this.sources.set(source, inputs);
            }
            inputs.push({ apply, resolve, reject });
            this.count++;
        });
        if (!this.stepped()) this.applyOnArrival();
        return applied;
    }

    /**
     * Applies what is held now, for a queue no input step will drain. Inputs held while the step
     * still ran go first, so arrival order holds across the switch. An input held by one this
     * applies, such as a removal a handler causes, is applied by the loop here after it rather
     * than inside it, so each input still runs to its end before the next begins.
     */
    private applyOnArrival(): void {
        if (this.applyingOnArrival) return;
        this.applyingOnArrival = true;
        try {
            while (this.count > 0) this.admit(Number.POSITIVE_INFINITY);
        } finally {
            this.applyingOnArrival = false;
        }
    }

    /**
     * The input step: applies held inputs, each to its end before the next, in one call that waits
     * for nothing.
     *
     * The step takes the inputs held when it begins, up to `budget` of them, in rounds: each round
     * takes the oldest input of every source in turn. A source that floods the queue therefore
     * gets one input per round like any other, and cannot hold back the inputs of the rest by
     * whole steps. A source's inputs keep their arrival order. When the budget runs out in the
     * middle of a round, the sources that round served move behind the ones it did not reach, so
     * the next step serves those first.
     *
     * The order depends only on what was held and what earlier steps took, never on timing. A
     * replay, which holds a tick's recorded inputs in the order the capture applied them, gets the
     * same order back: the first round of a step meets the sources in turn order, and the replay
     * holds them in that order.
     *
     * An input held while the step runs, such as one a handler in the step holds, waits for the
     * next step, so which step applies an input never depends on how fast the inputs before it ran.
     * A failing input settles its own caller with its error and does not stop the step. The callers
     * settle once the last input of the step has been applied, so nothing that waits on one input
     * runs while the step is still applying the others.
     *
     * @param budget - The most inputs this step applies.
     * @returns How many inputs this step applied.
     */
    public admit(budget = INPUT_ADMISSION_BUDGET_PER_TICK): number {
        // Every input is taken before any is applied, so an input held by one that runs waits for
        // the next step rather than joining this one.
        const step = this.take(Math.max(0, budget));

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

    /**
     * Takes the inputs of one step out of the queue, in the order the step applies them: in rounds
     * of one input from each source in turn, up to `limit`. Moves the sources served in a round the
     * limit cut short to the end of the turn order.
     */
    private take(limit: number): HeldInput[] {
        const turns = [...this.sources];
        const taken = new Array<number>(turns.length).fill(0);
        const step: HeldInput[] = [];
        // The sources served in the round the budget ran out in.
        let cutShort: unknown[] = [];

        rounds: for (let round = 0; step.length < limit; round++) {
            const served: unknown[] = [];
            for (const [index, [source, inputs]] of turns.entries()) {
                const input = inputs[round];
                if (input === undefined) continue;
                if (step.length === limit) {
                    cutShort = served;
                    break rounds;
                }
                step.push(input);
                taken[index]!++;
                served.push(source);
            }
            if (served.length === 0) break;
        }

        for (const [index, [source, inputs]] of turns.entries()) {
            inputs.splice(0, taken[index]);
            if (inputs.length === 0) this.sources.delete(source);
        }
        for (const source of cutShort) {
            const inputs = this.sources.get(source);
            if (inputs === undefined) continue;
            // Deleted and set again to move it to the end of the turn order.
            this.sources.delete(source);
            this.sources.set(source, inputs);
        }
        this.count -= step.length;
        return step;
    }
}
