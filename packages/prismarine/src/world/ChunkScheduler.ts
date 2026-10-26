import { chunkWorkerCount } from './generators/chunkConcurrency';

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

/** How long a tick may spend starting chunk deliveries, out of the 50 ms a tick has. */
export const DEFAULT_BUDGET_MS = 5;

/**
 * How many chunks the server may generate at once.
 *
 * Matches the Overworld worker count where workers are available. A host without spare cores
 * still keeps one request in flight, and a generator without a pool can queue those requests
 * behind its own single-threaded work.
 */
export const DEFAULT_DEPTH = Math.max(1, chunkWorkerCount());

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
 * - **It never waits for generation.** A tick starts work within its time budget and returns;
 *   deliveries continue in the background, up to the configured depth. A player with six
 *   hundred chunks queued costs the same per tick as one with six.
 * - **It is fair.** Players are served round robin, one chunk each per pass, so ten people
 *   joining at once all start seeing terrain rather than the first in the list getting
 *   everything and the rest waiting their turn.
 *
 * The budget is checked against elapsed time rather than a chunk count on purpose: even starting
 * a delivery has variable cost, and counting chunks could spend too long in a tick.
 */
export class ChunkScheduler {
    private readonly recipients = new Set<ChunkRecipient>();

    /** Where the last pass stopped, so the next one does not always start at the same player. */
    private cursor = 0;

    /** Deliveries still generating, shared across ticks so the server loop never waits for them. */
    private readonly inFlight = new Set<Promise<void>>();

    /** Recipients with completed chunks that need their partial batch dispatched. */
    private readonly readyToFlush = new Set<ChunkRecipient>();

    /** Recipients whose current batch flush is still in progress. */
    private readonly flushing = new Set<ChunkRecipient>();

    public constructor(
        private budgetMs: number = DEFAULT_BUDGET_MS,
        private readonly onFailure: ChunkFailureHandler = () => {},
        private depth: number = DEFAULT_DEPTH
    ) {}

    public add(recipient: ChunkRecipient): void {
        this.recipients.add(recipient);
    }

    public remove(recipient: ChunkRecipient): void {
        this.recipients.delete(recipient);
        this.readyToFlush.delete(recipient);
    }

    public setBudget(budgetMs: number): void {
        this.budgetMs = Math.max(0, budgetMs);
    }

    /** How many chunk deliveries may be generating at once. Clamped to at least one. */
    public setDepth(depth: number): void {
        this.depth = Math.max(1, Math.trunc(depth));
    }

    public get pending(): number {
        let total = 0;
        for (const recipient of this.recipients) if (!recipient.sender.isEmpty()) total++;

        return total;
    }

    /**
     * Starts chunk deliveries that fit in this tick's budget and in-flight depth.
     *
     * @param now - injectable clock, so tests can drive the budget deterministically.
     * @returns How many deliveries started.
     */
    public tick(now: () => number = () => Date.now()): Promise<number> {
        const started = now();
        let deliveriesStarted = 0;

        // Snapshot: delivering can disconnect a player, and mutating the set mid-pass would
        // invalidate the rotation.
        //
        // Not connected means *skipped*, never dropped. A player is registered while still
        // being set up and only counts as connected at the end of that, so a tick landing in
        // between would otherwise delete them from the rotation permanently - and nothing
        // ever re-registers, leaving that player in the void with no chunks at all. Removal
        // is explicit, from `remove` when the session ends.
        const active = [...this.recipients].filter((recipient) => recipient.isConnected());

        if (active.length === 0) return Promise.resolve(0);
        if (this.cursor >= active.length) this.cursor = 0;
        for (const recipient of active) {
            if (this.readyToFlush.has(recipient)) this.flushRecipient(recipient);
        }

        const begin = (recipient: ChunkRecipient, coord: { x: number; z: number }): void => {
            let delivery: Promise<void>;
            try {
                delivery = recipient.deliver(coord.x, coord.z);
            } catch (error: unknown) {
                delivery = Promise.reject(error);
            }

            let task: Promise<void>;
            task = delivery
                .then(
                    () => {
                        if (this.recipients.has(recipient)) this.readyToFlush.add(recipient);
                    },
                    (error: unknown) => {
                        this.onFailure(error, coord);
                    }
                )
                .finally(() => this.inFlight.delete(task));

            this.inFlight.add(task);
        };

        // One chunk per player per turn - that is the fairness - until either the budget
        // runs out or a full lap finds nobody with anything left to send.
        let emptyInARow = 0;
        while (emptyInARow < active.length && now() - started < this.budgetMs && this.inFlight.size < this.depth) {
            const recipient = active[this.cursor]!;
            this.cursor = (this.cursor + 1) % active.length;

            const next = recipient.sender.next();
            if (!next) {
                emptyInARow++;
                continue;
            }

            emptyInARow = 0;
            begin(recipient, next);
            deliveriesStarted++;
        }

        return Promise.resolve(deliveriesStarted);
    }

    /** Flushes ready chunks in order without making a server tick wait for the network. */
    private flushRecipient(recipient: ChunkRecipient): void {
        if (this.flushing.has(recipient)) return;
        this.flushing.add(recipient);

        const flush = async (): Promise<void> => {
            while (this.readyToFlush.delete(recipient)) {
                try {
                    await recipient.flush();
                } catch (error: unknown) {
                    this.onFailure(error);
                }
            }
        };

        void flush().finally(() => {
            this.flushing.delete(recipient);
            if (this.readyToFlush.has(recipient)) this.flushRecipient(recipient);
        });
    }
}

export default ChunkScheduler;
