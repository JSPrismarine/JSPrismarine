/**
 * Respawn searches a death or a respawn asks for, with their answers admitted as inputs.
 *
 * A player's death commits inside the blow that caused it, and the blow is synchronous, so it
 * cannot wait for a search, which reads blocks that may not be loaded. The death files a request
 * here instead, and the input step of the next tick tries it
 * ([ADR 0009](../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md)). An attempt
 * that lacks a chunk asks for it and waits ({@link RespawnSearch.attempt}), and the input step
 * that admits the chunk tries again and applies the answer. No step waits for a chunk, so which
 * tick applies an answer depends only on which tick admitted what the search read.
 */
import type { RespawnAnswer, RespawnRequest, RespawnSearch } from './RespawnSearch';

/** One search a player asked for, with what to do with its answer. */
interface PendingRespawn {
    readonly search: RespawnSearch;
    readonly request: RespawnRequest;
    readonly apply: (answer: RespawnAnswer) => Promise<void>;
}

/** The respawn searches waiting for an input step. */
export class RespawnRequests {
    private pending: PendingRespawn[] = [];

    public constructor(private readonly report: (error: unknown) => void) {}

    /** How many requests wait for an input step to answer them. */
    public get size(): number {
        return this.pending.length;
    }

    /**
     * Files a search that an input step tries, and applies the answer from once it has one.
     *
     * @param search - The level's search.
     * @param request - Who is asking, their spawn point and their body.
     * @param apply - Applies the answer, inside the input step.
     */
    public request(
        search: RespawnSearch,
        request: RespawnRequest,
        apply: (answer: RespawnAnswer) => Promise<void>
    ): void {
        this.pending.push({ search, request, apply });
    }

    /**
     * The input step's share: tries every request in the order it was filed and applies each
     * answer. A request still waiting stays for the next step, and so do the later requests of
     * the same player, so one player's answers apply in the order they were asked for.
     *
     * @returns How many answers were applied.
     */
    public async admit(): Promise<number> {
        const due = this.pending;
        this.pending = [];
        const waiting: PendingRespawn[] = [];
        const blocked = new Set<string>();
        let applied = 0;
        for (const pending of due) {
            const { player } = pending.request;
            if (blocked.has(player)) {
                waiting.push(pending);
                continue;
            }

            try {
                const attempt = pending.search.attempt(pending.request);
                if (attempt.kind === 'waiting') {
                    blocked.add(player);
                    waiting.push(pending);
                    continue;
                }
                await pending.apply(attempt.answer);
                applied += 1;
            } catch (error: unknown) {
                this.report(error);
            }
        }
        // A request an answer filed goes after the ones that were already waiting.
        this.pending = [...waiting, ...this.pending];
        return applied;
    }
}
