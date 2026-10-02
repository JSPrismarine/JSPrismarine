/**
 * Positions whose block should be given a chance to react, and when.
 *
 * Every kind of block physics is the same shape of problem: something changed *there*, so something
 * else may now have to happen *here*. Sand needs to know the block beneath it went away, a flower
 * needs to know the same, and water needs to know a hole opened beside it. Rather than have each of
 * those walk the world looking for work, a change announces itself and the blocks around it are
 * queued to look at their own situation once.
 *
 * Three properties earn this its own class:
 *
 * - **Deduplication.** Breaking one block queues its six neighbours, and each of those may queue
 *   theirs; without collapsing repeats, a column of falling sand queues the same positions over and
 *   over and the queue grows faster than it drains.
 * - **Delay.** Water spreads on a timer rather than instantly, and a falling block descends a block
 *   at a time. Both need to say "look at this again shortly" without blocking anything.
 * - **A budget.** A large enough cascade - a lake breached into a cavern - must not be allowed to
 *   take the tick down with it. Work left over is simply carried to the next tick.
 */

/** How many updates one tick may process before leaving the rest for the next. */
const UPDATES_PER_TICK = 4096;

/** A position, packed into one number so it can key a map cheaply. */
const pack = (x: number, y: number, z: number): string => `${x},${y},${z}`;

export interface BlockUpdate {
    x: number;
    y: number;
    z: number;
}

export class BlockUpdateScheduler {
    /**
     * Pending updates, keyed by position so a position waits once however often it is queued.
     *
     * The value is the tick it comes due. Re-queuing a position that is already waiting keeps the
     * *earlier* of the two times: a block asked to look at itself now and also in five ticks should
     * look now, and looking twice would be wasted work.
     */
    private readonly pending = new Map<string, { at: number; update: BlockUpdate }>();

    /**
     * Queues a position to be looked at.
     * @param {number} x - World x.
     * @param {number} y - World y.
     * @param {number} z - World z.
     * @param {number} now - The current tick.
     * @param {number} [delay=1] - Ticks to wait. Never zero: a block reacting within the change
     * that caused it would recurse through the whole cascade in one call.
     */
    public schedule(x: number, y: number, z: number, now: number, delay = 1): void {
        const key = pack(x, y, z);
        const at = now + Math.max(1, delay);

        const existing = this.pending.get(key);
        if (existing && existing.at <= at) return;

        this.pending.set(key, { at, update: { x, y, z } });
    }

    /**
     * Queues the six blocks touching a position, and the position itself.
     *
     * What a change announces. The block that changed is included because it may itself now be
     * unsupported - placing a flower and pulling the ground out from under it in the same breath.
     */
    public scheduleAround(x: number, y: number, z: number, now: number, delay = 1): void {
        this.schedule(x, y, z, now, delay);

        this.schedule(x + 1, y, z, now, delay);
        this.schedule(x - 1, y, z, now, delay);
        this.schedule(x, y + 1, z, now, delay);
        this.schedule(x, y - 1, z, now, delay);
        this.schedule(x, y, z + 1, now, delay);
        this.schedule(x, y, z - 1, now, delay);
    }

    /** How many updates are waiting, for tests and diagnostics. */
    public size(): number {
        return this.pending.size;
    }

    public clear(): void {
        this.pending.clear();
    }

    /**
     * Takes the updates that have come due.
     * @param {number} now - The current tick.
     * @returns {BlockUpdate[]} At most {@link UPDATES_PER_TICK} of them; the rest stay queued.
     */
    public due(now: number): BlockUpdate[] {
        if (this.pending.size === 0) return [];

        const ready: BlockUpdate[] = [];

        for (const [key, entry] of this.pending) {
            if (entry.at > now) continue;

            ready.push(entry.update);
            this.pending.delete(key);

            if (ready.length >= UPDATES_PER_TICK) break;
        }

        return ready;
    }
}

export default BlockUpdateScheduler;
