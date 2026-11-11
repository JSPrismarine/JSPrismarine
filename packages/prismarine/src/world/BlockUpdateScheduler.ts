import type { UnitJournal } from '../entity/data/EntityStore';
import { blockPositionKey } from './positionKeys';
import type { BlockPositionKey } from './positionKeys';

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
 * - **Deduplication.** Breaking one block queues its six neighbors, and each of those may queue
 *   theirs; without collapsing repeats, a column of falling sand queues the same positions over and
 *   over and the queue grows faster than it drains.
 * - **Delay.** Water spreads on a timer rather than instantly, and a falling block descends a block
 *   at a time. Both need to say "look at this again shortly" without blocking anything.
 * - **A budget.** A large enough cascade - a lake breached into a cavern - must not be allowed to
 *   take the tick down with it. Work left over is simply carried to the next tick.
 */

/**
 * How many updates one tick may process before leaving the rest for the next.
 *
 * A count and nothing else, so the same queue drains the same way on every host. A host too slow
 * to run this many in a tick's period ticks slower and does not process fewer.
 */
export const BLOCK_UPDATE_BUDGET_PER_TICK = 4096;

interface PendingUpdate {
    readonly at: number;
    readonly update: BlockUpdate;
}

/** Integer world coordinates queued for a block-physics check. */
export interface BlockUpdate {
    x: number;
    y: number;
    z: number;
}

/**
 * Coalesces delayed block-physics checks and drains them within a per-tick budget.
 *
 * It is a {@link UnitJournal} of the world's change log: while a unit of work runs, each schedule
 * records what it replaced, so undoing a unit that wrote a block also takes back the updates the
 * write queued.
 */
export class BlockUpdateScheduler implements UnitJournal {
    /**
     * Pending updates, keyed by position so duplicate schedules update their due time in place.
     *
     * The value is the tick it comes due. Re-queuing a position that is already waiting keeps the
     * *earlier* of the two times: a block asked to look at itself now and also in five ticks should
     * look now, and looking twice would be wasted work.
     */
    private readonly pending = new Map<BlockPositionKey, PendingUpdate>();

    /** Earliest due tick, allowing an all-future queue to return without scanning. */
    private earliestDue = Number.POSITIVE_INFINITY;

    /** What each schedule since the outermost open unit began replaced, oldest first, or null outside units. */
    private journal: { readonly key: BlockPositionKey; readonly replaced: PendingUpdate | undefined }[] | null = null;

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
        const key = blockPositionKey(x, y, z);
        const at = now + Math.max(1, delay);

        const existing = this.pending.get(key);
        if (existing && existing.at <= at) return;

        this.journal?.push({ key, replaced: existing });
        this.pending.set(key, { at, update: { x, y, z } });

        if (Number.isNaN(at)) this.earliestDue = Number.NEGATIVE_INFINITY;
        else if (at < this.earliestDue) this.earliestDue = at;
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
    /** Starts recording what each schedule replaces, for a unit that is starting. */
    public markUnit(): number {
        this.journal ??= [];
        return this.journal.length;
    }

    /** Takes back every schedule made since `mark`, newest first, for a unit that was undone. */
    public revertUnit(mark: number): void {
        const journal = this.journal;
        if (journal === null) return;
        while (journal.length > mark) {
            const { key, replaced } = journal.pop()!;
            if (replaced === undefined) this.pending.delete(key);
            else this.pending.set(key, replaced);
        }
        this.recomputeEarliestDue();
    }

    /** Stops recording, once no unit is open. */
    public settleUnits(): void {
        this.journal = null;
    }

    /** How many positions are waiting. */
    public size(): number {
        return this.pending.size;
    }

    /**
     * Copies pending positions and due ticks in their processing order.
     *
     * Map insertion order is meaningful: when the per-tick budget leaves work queued, the next
     * positions processed depend on this order.
     */
    public snapshot(): readonly { readonly dueTick: number; readonly position: BlockUpdate }[] {
        return [...this.pending.values()].map(({ at, update }) => ({ dueTick: at, position: { ...update } }));
    }

    public clear(): void {
        this.pending.clear();
        this.earliestDue = Number.POSITIVE_INFINITY;
    }

    /**
     * Takes the updates that have come due.
     * @param {number} now - The current tick.
     * @returns {BlockUpdate[]} At most {@link BLOCK_UPDATE_BUDGET_PER_TICK} of them; the rest stay queued.
     */
    public due(now: number): BlockUpdate[] {
        if (this.pending.size === 0 || this.earliestDue > now) return [];

        const ready: BlockUpdate[] = [];
        let reachedBudget = false;

        for (const [key, entry] of this.pending) {
            if (entry.at > now) continue;

            ready.push(entry.update);
            this.pending.delete(key);

            if (ready.length >= BLOCK_UPDATE_BUDGET_PER_TICK) {
                reachedBudget = true;
                break;
            }
        }

        if (reachedBudget) this.earliestDue = now;
        else if (this.earliestDue <= now) this.recomputeEarliestDue();
        if (this.pending.size === 0) {
            this.earliestDue = Number.POSITIVE_INFINITY;
        }

        return ready;
    }

    /** Re-scans only after the current earliest due tick has left the queue. */
    private recomputeEarliestDue(): void {
        this.earliestDue = Number.POSITIVE_INFINITY;
        for (const { at } of this.pending.values()) {
            if (Number.isNaN(at)) {
                this.earliestDue = Number.NEGATIVE_INFINITY;
                return;
            }
            if (at < this.earliestDue) this.earliestDue = at;
        }
    }
}

export default BlockUpdateScheduler;
