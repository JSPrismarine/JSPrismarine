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

const identity = (tick: Pick<ScheduledTick, 'at' | 'type'>): string => `${positionKey(tick.at)}|${tick.type}`;

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
    private batch: ScheduledTick[] = [];
    private readonly batchIdentities = new Set<string>();
    private subTickCounter = 0;

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
        this.queue.push({ type, at, triggerTick, priority, subTickOrder: this.subTickCounter++ });
        return true;
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
        return this.queue.length;
    }

    /** Remove every queued tick at one position, which a destroyed block needs. */
    clearAt(at: BlockPosition): void {
        for (let i = this.queue.length - 1; i >= 0; i--) {
            const tick = this.queue[i]!;
            if (tick.at.x === at.x && tick.at.y === at.y && tick.at.z === at.z) {
                this.queued.delete(identity(tick));
                this.queue.splice(i, 1);
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
     * @param currentTick - The game tick to run.
     * @param run - Called once per due tick, in order.
     * @param maxTicks - The per-tick budget, defaulting to Java's 65536.
     * @returns How many ticks ran.
     */
    tick(currentTick: number, run: TickHandler, maxTicks: number = MAX_SCHEDULED_TICKS_PER_TICK): number {
        this.queue.sort(drainOrder);

        const collected: ScheduledTick[] = [];
        while (collected.length < maxTicks) {
            const next = this.queue[0];
            if (next === undefined || next.triggerTick > currentTick) break;
            this.queue.shift();
            this.queued.delete(identity(next));
            collected.push(next);
        }

        collected.sort(intraTickDrainOrder);
        this.batch = collected;
        this.batchIdentities.clear();
        for (const tick of collected) this.batchIdentities.add(identity(tick));

        for (const tick of this.batch) {
            this.batchIdentities.delete(identity(tick));
            run(tick);
        }

        this.batch = [];
        this.batchIdentities.clear();
        return collected.length;
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
     * Run one game tick: block ticks first, then fluid ticks, matching the order
     * in `ServerLevel.tick`.
     *
     * @param currentTick - The game tick to run.
     * @param run - Called with each due tick and the list it came from.
     * @param maxTicks - The per-list budget, defaulting to Java's 65536.
     * @returns How many ticks ran across both lists.
     */
    tick(
        currentTick: number,
        run: (kind: TickKind, tick: ScheduledTick) => void,
        maxTicks: number = MAX_SCHEDULED_TICKS_PER_TICK
    ): number {
        const blocks = this.lists.block.tick(currentTick, (tick) => run('block', tick), maxTicks);
        const fluids = this.lists.fluid.tick(currentTick, (tick) => run('fluid', tick), maxTicks);
        return blocks + fluids;
    }
}
