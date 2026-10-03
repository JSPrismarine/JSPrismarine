/** A queue the scheduler can drain: one player's outstanding chunks. */
export interface SchedulableSender {
    isEmpty(): boolean;
    next(): { x: number; z: number } | null;
}

/** What the scheduler needs of a player: a queue, and a way to deliver one chunk. */
export interface ChunkRecipient {
    readonly sender: SchedulableSender;

    /** Resolves once the chunk is on its way; rejects if it could not be produced. */
    deliver(x: number, z: number): Promise<void>;

    /** Dispatches whatever `deliver` produced but has not sent yet. */
    flush(): Promise<void>;

    /** Dropped from the rotation when this goes false. */
    isConnected(): boolean;
}

/** How long a tick may spend sending chunks, out of the 50 ms a tick has. */
export const DEFAULT_BUDGET_MS = 5;

/**
 * Told about a chunk that could not be produced or sent. `coord` is absent when the failure
 * was a flush, which covers a whole batch rather than one coordinate.
 */
export type ChunkFailureHandler = (error: unknown, coord?: { x: number; z: number }) => void;

/**
 * Hands out chunks to players a little at a time.
 *
 * Two properties matter here, and both come from the same loop:
 *
 * - **It never blocks.** Work stops once the tick's time budget is spent and resumes on the
 *   next tick, so a player with six hundred chunks queued costs the same per tick as one
 *   with six. Before this, joining meant a single loop that ran to completion - hundreds of
 *   milliseconds during which the socket answered nothing and every other player froze.
 * - **It is fair.** Players are served round robin, one chunk each per pass, so ten people
 *   joining at once all start seeing terrain rather than the first in the list getting
 *   everything and the rest waiting their turn.
 *
 * The budget is checked against elapsed time rather than a chunk count on purpose: a chunk
 * that has to be generated costs an order of magnitude more than one already in memory, and
 * counting chunks would let a run of the expensive kind blow far past the intended slice.
 */
export class ChunkScheduler {
    private readonly recipients = new Set<ChunkRecipient>();

    /** Where the last pass stopped, so the next one does not always start at the same player. */
    private cursor = 0;

    public constructor(
        private budgetMs: number = DEFAULT_BUDGET_MS,
        private readonly onFailure: ChunkFailureHandler = () => {}
    ) {}

    public add(recipient: ChunkRecipient): void {
        this.recipients.add(recipient);
    }

    public remove(recipient: ChunkRecipient): void {
        this.recipients.delete(recipient);
    }

    public setBudget(budgetMs: number): void {
        this.budgetMs = Math.max(0, budgetMs);
    }

    public get pending(): number {
        let total = 0;
        for (const recipient of this.recipients) if (!recipient.sender.isEmpty()) total++;

        return total;
    }

    /**
     * Sends what fits in this tick's budget.
     *
     * @param now - injectable clock, so tests can drive the budget deterministically.
     * @returns how many chunks went out.
     */
    public async tick(now: () => number = () => Date.now()): Promise<number> {
        const started = now();
        let sent = 0;

        // Snapshot: delivering can disconnect a player, and mutating the set mid-pass would
        // invalidate the rotation.
        //
        // Not connected means *skipped*, never dropped. A player is registered while still
        // being set up and only counts as connected at the end of that, so a tick landing in
        // between would otherwise delete them from the rotation permanently - and nothing
        // ever re-registers, leaving that player in the void with no chunks at all. Removal
        // is explicit, from `remove` when the session ends.
        const active = [...this.recipients].filter((recipient) => recipient.isConnected());

        if (active.length === 0) return 0;
        if (this.cursor >= active.length) this.cursor = 0;

        // One chunk per player per turn - that is the fairness - until either the budget
        // runs out or a full lap finds nobody with anything left to send.
        let emptyInARow = 0;
        while (emptyInARow < active.length && now() - started < this.budgetMs) {
            const recipient = active[this.cursor]!;
            this.cursor = (this.cursor + 1) % active.length;

            const next = recipient.sender.next();
            if (!next) {
                emptyInARow++;
                continue;
            }

            emptyInARow = 0;

            // One chunk that cannot be produced must not take the tick with it.
            //
            // This is awaited from `Server.tick`, so a rejection escaping here rejects the
            // tick itself - and the next timer is only installed after that await, so the
            // server would stop ticking altogether and never start again. A failed chunk is
            // a hole in one player's terrain; a failed tick is the whole server. The
            // recipient is left to undo its own bookkeeping so the coordinate can be queued
            // again, and the failure is reported rather than swallowed.
            try {
                await recipient.deliver(next.x, next.z);
                sent++;
            } catch (error: unknown) {
                this.onFailure(error, next);
            }
        }

        // A partial batch would otherwise wait for the next tick. This is bounded - one
        // short batch per player - and deliberately outside the budget check: refusing to
        // flush would only push the same work into the following tick.
        if (sent > 0) {
            await Promise.all(
                active.map(async (recipient) => {
                    try {
                        await recipient.flush();
                    } catch (error: unknown) {
                        this.onFailure(error);
                    }
                })
            );
        }

        return sent;
    }
}

export default ChunkScheduler;
