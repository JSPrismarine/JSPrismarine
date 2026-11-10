/**
 * Respawn searches a death asks for, with their answers admitted as inputs.
 *
 * A player's death commits inside the blow that caused it, and the blow is synchronous, so it
 * cannot wait for {@link RespawnSearch.find}, which reads blocks and may load chunks or build a
 * dimension. The death files a request here instead, and the answer comes back at the input step
 * of the next tick ([ADR 0009](../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md)):
 * the step waits for every request filed before it, in the order they were filed, so which tick
 * applies an answer never depends on how fast the search ran.
 */
import type { RespawnAnswer } from './RespawnSearch';

/** One search a death started, with what to do with its answer. */
interface PendingRespawn {
    readonly answer: Promise<RespawnAnswer>;
    readonly apply: (answer: RespawnAnswer) => Promise<void>;
}

/** The respawn searches waiting for an input step. */
export class RespawnRequests {
    private pending: PendingRespawn[] = [];

    public constructor(private readonly report: (error: unknown) => void) {}

    /** How many answers wait for the next input step. */
    public get size(): number {
        return this.pending.length;
    }

    /**
     * Files a search whose answer the next input step applies.
     *
     * @param answer - The search, already started, so it runs while the tick finishes.
     * @param apply - Applies the answer, inside the input step.
     */
    public request(answer: Promise<RespawnAnswer>, apply: (answer: RespawnAnswer) => Promise<void>): void {
        // Caught here so a search that fails before the step does not surface as an unhandled
        // rejection; the step reports it when it reaches the request.
        answer.catch(() => undefined);
        this.pending.push({ answer, apply });
    }

    /**
     * The input step's share: waits for every search filed before it and applies the answers in
     * the order the deaths filed them.
     *
     * @returns How many answers were applied.
     */
    public async admit(): Promise<number> {
        const due = this.pending;
        this.pending = [];
        let applied = 0;
        for (const { answer, apply } of due) {
            try {
                await apply(await answer);
                applied += 1;
            } catch (error: unknown) {
                this.report(error);
            }
        }
        return applied;
    }
}
