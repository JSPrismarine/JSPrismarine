/**
 * Java's scheduled block and fluid ticks.
 *
 * Transcribed from `net.minecraft.world.ticks.LevelTicks`, `LevelChunkTicks` and
 * `ScheduledTick` in the pinned 26.3 server jar. Resolved block families use it
 * for delayed behavior such as repeater transitions, fluid flow, and fire spread.
 *
 * A scheduled tick is a request to run a block's `tick` method at a future game
 * tick. An immediate neighbor update is not scheduled at all: it runs inside the
 * call that changed the block, where the active block family can react and
 * schedule any later work it needs.
 */

import type { BlockPosition, TickKind } from './world';
import { positionKey } from './world';

/**
 * Java's `TickPriority` values, lowest first. The numbers are the enum's own
 * `value` field, read from `TickPriority` in the 26.3 jar, and the comparator
 * sorts on them directly.
 *
 * The data-driven redstone family uses these values for repeaters and
 * comparators. Their priority rules match `DiodeBlock.checkTickOnNeighbor`.
 */
export const TICK_PRIORITIES = {
    EXTREMELY_HIGH: -3,
    VERY_HIGH: -2,
    HIGH: -1,
    NORMAL: 0,
    LOW: 1,
    VERY_LOW: 2,
    EXTREMELY_LOW: 3
} as const;

/** One of the {@link TICK_PRIORITIES} values. */
export type TickPriority = (typeof TICK_PRIORITIES)[keyof typeof TICK_PRIORITIES];

/**
 * How many ticks one game tick may run, per tick list.
 *
 * `ServerLevel.tick` passes 65536 to both `blockTicks.tick` and
 * `fluidTicks.tick` in the 26.3 jar. Bedrock's limit is 100 per chunk, which
 * this package does not implement; see the README.
 */
export const MAX_SCHEDULED_TICKS_PER_TICK = 65536;

/** One queued tick. */
export interface ScheduledTick {
    /** The block or fluid identifier whose tick method runs. */
    readonly type: string;
    readonly at: BlockPosition;
    /** The game tick this fires on. */
    readonly triggerTick: number;
    readonly priority: number;
    /** The order the tick was scheduled in, Java's `subTickOrder`. */
    readonly subTickOrder: number;
}

/** What a drained tick's handler receives. */
export type TickHandler = (tick: ScheduledTick) => void;

/** When a queued tick fires and where it sorts: everything a tick holds besides its position and type. */
export type ScheduledTickTiming = {
    readonly triggerTick: number;
    readonly priority: number;
    readonly subTickOrder: number;
};

/**
 * One tick queued on a list or taken off it, as a host that records the lists sees it. `before`
 * is null for a tick that was queued and `after` is null for one that was taken off, whether it
 * ran or was cleared.
 */
export interface TickListChange {
    readonly at: BlockPosition;
    readonly type: string;
    readonly before: ScheduledTickTiming | null;
    readonly after: ScheduledTickTiming | null;
}

/** Hears every change to one tick list. */
export type TickListObserver = (change: TickListChange) => void;

const timingOf = ({ triggerTick, priority, subTickOrder }: ScheduledTick): ScheduledTickTiming => ({
    triggerTick,
    priority,
    subTickOrder
});

const identity = (tick: Pick<ScheduledTick, 'at' | 'type'>): string => `${positionKey(tick.at)}|${tick.type}`;

/** The chunk a position is in, as the per-chunk index keys it. */
const chunkKeyOf = (x: number, z: number): string => `${x >> 4},${z >> 4}`;

/**
 * Java's `ScheduledTick.DRAIN_ORDER`: trigger tick, then priority, then the
 * order the ticks were scheduled in.
 */
const drainOrder = (a: ScheduledTick, b: ScheduledTick): number =>
    a.triggerTick - b.triggerTick || a.priority - b.priority || a.subTickOrder - b.subTickOrder;

/**
 * Java's `ScheduledTick.INTRA_TICK_DRAIN_ORDER`: priority, then schedule order.
 * The trigger tick is deliberately not a tiebreaker, so a high-priority tick
 * runs before a lower-priority one that has been waiting longer.
 */
const intraTickDrainOrder = (a: ScheduledTick, b: ScheduledTick): number =>
    a.priority - b.priority || a.subTickOrder - b.subTickOrder;

/**
 * One tick list: Java's `LevelTicks` for a single kind, block or fluid.
 *
 * Java shards the queue per chunk and merges the shards in `drainContainers`.
 * This keeps one queue for the whole world, which produces the same order
 * whenever every due tick has the same trigger tick. The two differ only for a
 * backlog that the per-tick budget left behind, and there this ordering is the
 * stricter one: it runs the oldest ticks first.
 */
export class TickList {
    private readonly queue: ScheduledTick[] = [];
    private readonly queued = new Set<string>();
    /** The live ticks of each chunk, Java's `LevelChunkTicks`, so a chunk's ticks are found without reading the queue. */
    private readonly byChunk = new Map<string, Set<ScheduledTick>>();
    /**
     * Ticks a chunk unload took off but the queue still holds. They are skipped everywhere and
     * dropped by the next {@link TickList.tick}, which sorts the whole queue anyway, so unloading a
     * chunk costs its own ticks rather than a pass over every queued one.
     */
    private readonly removed = new Set<ScheduledTick>();
    private batch: ScheduledTick[] = [];
    private readonly batchIdentities = new Set<string>();
    private subTickCounter = 0;

    /**
     * Hears each tick queued and each tick taken off, in the order they happen. A host that keeps
     * a history of its world sets it; {@link TickList.restore} does not report to it.
     */
    public observer: TickListObserver | undefined;

    /**
     * Queue a tick, unless one is already queued for the same position and type.
     *
     * Java's `LevelChunkTicks.schedule` adds to a `ticksPerPosition` set first
     * and drops the tick when the set already holds it, which is the rule the
     * wiki states for repeaters: "any attempt to schedule a tick while one
     * already exists is completely ignored".
     *
     * @param at - The position the tick fires for.
     * @param type - The block or fluid identifier.
     * @param triggerTick - The absolute game tick to fire on.
     * @param priority - One of {@link TICK_PRIORITIES}, defaulting to `NORMAL`.
     * @returns True when the tick was queued, false when one already existed.
     */
    schedule(at: BlockPosition, type: string, triggerTick: number, priority: number = TICK_PRIORITIES.NORMAL): boolean {
        const key = identity({ at, type });
        if (this.queued.has(key)) return false;
        this.queued.add(key);
        // A copy, so a caller that moves its own position afterwards cannot move the queued tick
        // away from the key `queued` holds for it, which `restore` trusts to skip its scan.
        const position = { x: at.x, y: at.y, z: at.z };
        const tick: ScheduledTick = { type, at: position, triggerTick, priority, subTickOrder: this.subTickCounter++ };
        this.queue.push(tick);
        this.index(tick);
        this.observer?.({ at: position, type, before: null, after: timingOf(tick) });
        return true;
    }

    /**
     * Puts one tick back as a recorded change left it, without reporting it: queued with the
     * timing given, or taken off when the timing is null. A host undoes a change or replays its
     * history through this.
     *
     * @param at - The tick's position.
     * @param type - The block or fluid identifier.
     * @param timing - What the tick holds, or null for no tick at that position and type.
     */
    restore(at: BlockPosition, type: string, timing: ScheduledTickTiming | null): void {
        const key = identity({ at, type });
        // The set says whether the tick is queued, so a restore of one that is not skips the scan:
        // an undo or a replay restores once per logged tick, which would read the queue each time.
        const index = this.queued.has(key)
            ? this.queue.findIndex((tick) => !this.removed.has(tick) && identity(tick) === key)
            : -1;
        if (index !== -1) this.unindex(this.queue.splice(index, 1)[0]!);
        if (timing === null) {
            this.queued.delete(key);
            return;
        }
        this.queued.add(key);
        const tick: ScheduledTick = { type, at: { x: at.x, y: at.y, z: at.z }, ...timing };
        this.queue.push(tick);
        this.index(tick);
        // Ticks queued after this sort after it, as they did when it was first queued.
        this.subTickCounter = Math.max(this.subTickCounter, timing.subTickOrder + 1);
    }

    /** Whether a tick is queued for this position and type. */
    hasScheduledTick(at: BlockPosition, type: string): boolean {
        return this.queued.has(identity({ at, type }));
    }

    /**
     * Whether a queued tick is in the batch the current game tick is running,
     * which is Java's `LevelTicks.willTickThisTick`. A diode calls it to avoid
     * rescheduling a tick that is about to run.
     */
    willTickThisTick(at: BlockPosition, type: string): boolean {
        return this.batchIdentities.has(identity({ at, type }));
    }

    /** How many ticks are queued. */
    count(): number {
        return this.queue.length - this.removed.size;
    }

    /**
     * Whether any tick is queued for a position inside one chunk, without copying them.
     *
     * @param chunkX - The chunk's x, in chunks.
     * @param chunkZ - The chunk's z, in chunks.
     */
    hasTicksInChunk(chunkX: number, chunkZ: number): boolean {
        return (this.byChunk.get(`${chunkX},${chunkZ}`)?.size ?? 0) > 0;
    }

    /**
     * Copies the ticks queued for positions inside one chunk, in no particular order.
     *
     * @param chunkX - The chunk's x, in chunks.
     * @param chunkZ - The chunk's z, in chunks.
     */
    ticksInChunk(chunkX: number, chunkZ: number): readonly ScheduledTick[] {
        const ticks = this.byChunk.get(`${chunkX},${chunkZ}`);
        if (ticks === undefined) return [];
        return [...ticks].map((tick) => ({ ...tick, at: { ...tick.at } }));
    }

    /**
     * Takes every tick of one chunk off the list, which is what Java's `LevelTicks.removeContainer`
     * does when the chunk unloads. A host saves them with the chunk first and schedules them again
     * when it loads.
     *
     * Costs the chunk's own ticks: they are found through the per-chunk index and left in the
     * queue, skipped, until the next {@link TickList.tick} drops them in the pass it makes anyway.
     *
     * @param chunkX - The chunk's x, in chunks.
     * @param chunkZ - The chunk's z, in chunks.
     * @returns How many ticks were taken off.
     */
    clearChunk(chunkX: number, chunkZ: number): number {
        const key = `${chunkX},${chunkZ}`;
        const ticks = this.byChunk.get(key);
        if (ticks === undefined) return 0;
        this.byChunk.delete(key);
        for (const tick of ticks) {
            this.queued.delete(identity(tick));
            this.removed.add(tick);
            this.observer?.({ at: tick.at, type: tick.type, before: timingOf(tick), after: null });
        }
        return ticks.size;
    }

    /**
     * Copies the pending ticks in drain order for diagnostics and replay comparisons.
     *
     * This sorts a copy, leaving the live queue order untouched. Each position is copied too,
     * so callers cannot mutate a queued tick through the returned state.
     */
    snapshot(): readonly ScheduledTick[] {
        return this.queue
            .filter((tick) => !this.removed.has(tick))
            .sort(drainOrder)
            .map((tick) => ({ ...tick, at: { ...tick.at } }));
    }

    /** Remove every queued tick at one position, which a destroyed block needs. */
    clearAt(at: BlockPosition): void {
        for (let i = this.queue.length - 1; i >= 0; i--) {
            const tick = this.queue[i]!;
            if (this.removed.has(tick)) continue;
            if (tick.at.x === at.x && tick.at.y === at.y && tick.at.z === at.z) {
                this.queued.delete(identity(tick));
                this.queue.splice(i, 1);
                this.unindex(tick);
                this.observer?.({ at: tick.at, type: tick.type, before: timingOf(tick), after: null });
            }
        }
    }

    /**
     * Collect every tick due at `currentTick`, up to the budget, and run them.
     *
     * Collection takes the oldest ticks first, as Java's per-chunk queues do.
     * The collected batch then runs in `INTRA_TICK_DRAIN_ORDER`, priority before
     * schedule order. A tick scheduled by a handler during the batch lands in a
     * later game tick, never in the batch being run, which is what makes a
     * repeater chain take its delay rather than collapsing into one tick.
     *
     * The budget is a count and nothing else. The list reads no clock, so a slow host runs the
     * same ticks as a fast one and only takes longer to do it.
     *
     * @param currentTick - The game tick to run.
     * @param run - Called once per due tick, in order.
     * @param maxTicks - The per-tick budget, defaulting to Java's 65536. Due ticks past it stay
     * queued, still due, and run first on the next game tick.
     * @param canTick - Whether a chunk's ticks may run now, Java's `LevelTicks` tick check. A due
     * tick in a chunk that may not stays queued, still due, and counts against no budget.
     * @returns How many ticks ran.
     */
    tick(
        currentTick: number,
        run: TickHandler,
        maxTicks: number = MAX_SCHEDULED_TICKS_PER_TICK,
        canTick?: (chunkX: number, chunkZ: number) => boolean
    ): number {
        if (this.removed.size > 0) {
            let kept = 0;
            for (const tick of this.queue) if (!this.removed.has(tick)) this.queue[kept++] = tick;
            this.queue.length = kept;
            this.removed.clear();
        }
        this.queue.sort(drainOrder);

        const collected: ScheduledTick[] = [];
        const held: ScheduledTick[] = [];
        let dueCount = 0;
        while (collected.length < maxTicks) {
            const next = this.queue[dueCount];
            if (next === undefined || next.triggerTick > currentTick) break;
            dueCount++;
            if (canTick === undefined || canTick(next.at.x >> 4, next.at.z >> 4)) collected.push(next);
            else held.push(next);
        }

        // A single prefix splice moves the remaining queue once; shifting each due tick moves it
        // repeatedly. The held ticks go back in front, still in drain order.
        this.queue.splice(0, dueCount, ...held);
        for (const tick of collected) {
            this.queued.delete(identity(tick));
            this.unindex(tick);
            this.observer?.({ at: tick.at, type: tick.type, before: timingOf(tick), after: null });
        }

        collected.sort(intraTickDrainOrder);
        this.batch = collected;
        this.batchIdentities.clear();
        for (const tick of collected) this.batchIdentities.add(identity(tick));

        let ran = 0;
        for (const tick of this.batch) {
            this.batchIdentities.delete(identity(tick));
            run(tick);
            ran += 1;
        }

        this.batch = [];
        this.batchIdentities.clear();
        return ran;
    }

    /** Files a queued tick under its chunk. */
    private index(tick: ScheduledTick): void {
        const key = chunkKeyOf(tick.at.x, tick.at.z);
        let ticks = this.byChunk.get(key);
        if (ticks === undefined) {
            ticks = new Set();
            this.byChunk.set(key, ticks);
        }
        ticks.add(tick);
    }

    /** Takes a tick that left the queue out of its chunk's set. */
    private unindex(tick: ScheduledTick): void {
        const key = chunkKeyOf(tick.at.x, tick.at.z);
        const ticks = this.byChunk.get(key);
        if (ticks === undefined) return;
        ticks.delete(tick);
        if (ticks.size === 0) this.byChunk.delete(key);
    }
}

/**
 * The block tick list and the fluid tick list, which `ServerLevel.tick` runs in
 * that order: `blockTicks.tick` before `fluidTicks.tick`, both before block
 * events and entities.
 */
export class TickScheduler {
    private readonly lists: Record<TickKind, TickList> = { block: new TickList(), fluid: new TickList() };

    /** One of the two tick lists. */
    list(kind: TickKind): TickList {
        return this.lists[kind];
    }

    /**
     * Hears every change to both lists, each with the list it was made to, or stops when given
     * undefined.
     */
    observe(observer: ((kind: TickKind, change: TickListChange) => void) | undefined): void {
        for (const kind of ['block', 'fluid'] as const)
            this.lists[kind].observer = observer === undefined ? undefined : (change) => observer(kind, change);
    }

    /** Copies pending block and fluid ticks without changing their live drain order. */
    snapshot(): { readonly block: readonly ScheduledTick[]; readonly fluid: readonly ScheduledTick[] } {
        return { block: this.lists.block.snapshot(), fluid: this.lists.fluid.snapshot() };
    }

    /**
     * Run one game tick: block ticks first, then fluid ticks, matching the order
     * in `ServerLevel.tick`.
     *
     * @param currentTick - The game tick to run.
     * @param run - Called with each due tick and the list it came from.
     * @param maxTicks - The per-list budget, defaulting to Java's 65536.
     * @param canTick - Whether a list's ticks in a chunk may run now; see {@link TickList.tick}.
     * @returns How many ticks ran across both lists.
     */
    tick(
        currentTick: number,
        run: (kind: TickKind, tick: ScheduledTick) => void,
        maxTicks: number = MAX_SCHEDULED_TICKS_PER_TICK,
        canTick?: (kind: TickKind, chunkX: number, chunkZ: number) => boolean
    ): number {
        const check = (kind: TickKind) =>
            canTick === undefined ? undefined : (chunkX: number, chunkZ: number) => canTick(kind, chunkX, chunkZ);
        const blocks = this.lists.block.tick(currentTick, (tick) => run('block', tick), maxTicks, check('block'));
        const fluids = this.lists.fluid.tick(currentTick, (tick) => run('fluid', tick), maxTicks, check('fluid'));
        return blocks + fluids;
    }
}
