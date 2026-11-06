import { describe, expect, it, vi } from 'vitest';

import { MAX_SCHEDULED_TICKS_PER_TICK, TICK_PRIORITIES, TickList, TickScheduler } from './scheduler';
import type { ScheduledTick } from './scheduler';
import type { BlockPosition } from './world';

const at = (x: number, y = 0, z = 0): BlockPosition => ({ x, y, z });

const drain = (list: TickList, tick: number, maxTicks?: number): string[] => {
    const ran: string[] = [];
    list.tick(tick, (scheduled) => ran.push(`${scheduled.type}@${scheduled.at.x}`), maxTicks);
    return ran;
};

interface ReferenceTickList {
    readonly queue: ScheduledTick[];
    readonly queued: Set<string>;
    nextOrder: number;
}

const referenceIdentity = (at: BlockPosition, type: string): string => `${at.x},${at.y},${at.z}|${type}`;

const referenceSchedule = (
    list: ReferenceTickList,
    position: BlockPosition,
    type: string,
    triggerTick: number,
    priority: number
): boolean => {
    const key = referenceIdentity(position, type);
    if (list.queued.has(key)) return false;
    list.queued.add(key);
    list.queue.push({ type, at: position, triggerTick, priority, subTickOrder: list.nextOrder++ });
    return true;
};

const referenceTick = (
    list: ReferenceTickList,
    currentTick: number,
    maxTicks: number,
    run: (tick: ScheduledTick) => void
): number => {
    list.queue.sort(
        (left, right) =>
            left.triggerTick - right.triggerTick ||
            left.priority - right.priority ||
            left.subTickOrder - right.subTickOrder
    );

    const collected: ScheduledTick[] = [];
    while (collected.length < maxTicks) {
        const next = list.queue[0];
        if (next === undefined || next.triggerTick > currentTick) break;
        list.queue.shift();
        list.queued.delete(referenceIdentity(next.at, next.type));
        collected.push(next);
    }

    collected.sort((left, right) => left.priority - right.priority || left.subTickOrder - right.subTickOrder);
    for (const tick of collected) run(tick);
    return collected.length;
};

const tickSignature = (tick: ScheduledTick): string =>
    `${tick.at.x},${tick.at.y},${tick.at.z}|${tick.type}|${tick.triggerTick}|${tick.priority}|${tick.subTickOrder}`;

describe('TickList', () => {
    it('runs nothing before the trigger tick and the tick on it', () => {
        const list = new TickList();
        list.schedule(at(0), 'minecraft:repeater', 4);

        expect(drain(list, 3)).toEqual([]);
        expect(drain(list, 4)).toEqual(['minecraft:repeater@0']);
        expect(list.count()).toBe(0);
    });

    it('orders one batch by TickPriority, the jar values -3 through 3', () => {
        const list = new TickList();
        list.schedule(at(0), 'normal', 1, TICK_PRIORITIES.NORMAL);
        list.schedule(at(1), 'extremelyLow', 1, TICK_PRIORITIES.EXTREMELY_LOW);
        list.schedule(at(2), 'extremelyHigh', 1, TICK_PRIORITIES.EXTREMELY_HIGH);
        list.schedule(at(3), 'veryHigh', 1, TICK_PRIORITIES.VERY_HIGH);
        list.schedule(at(4), 'high', 1, TICK_PRIORITIES.HIGH);

        expect(drain(list, 1)).toEqual(['extremelyHigh@2', 'veryHigh@3', 'high@4', 'normal@0', 'extremelyLow@1']);
    });

    it('breaks a priority tie by the order the ticks were scheduled', () => {
        const list = new TickList();
        list.schedule(at(7), 'second', 1);
        list.schedule(at(2), 'first', 1);
        list.schedule(at(5), 'third', 1);

        expect(drain(list, 1)).toEqual(['second@7', 'first@2', 'third@5']);
    });

    it('ignores a second tick for the same position and type', () => {
        const list = new TickList();

        expect(list.schedule(at(0), 'minecraft:repeater', 4)).toBe(true);
        expect(list.schedule(at(0), 'minecraft:repeater', 2)).toBe(false);
        expect(list.count()).toBe(1);
        expect(drain(list, 2)).toEqual([]);
        expect(drain(list, 4)).toEqual(['minecraft:repeater@0']);
    });

    it('keeps one tick per type at a position', () => {
        const list = new TickList();
        list.schedule(at(0), 'minecraft:repeater', 1);
        list.schedule(at(0), 'minecraft:water', 1);

        expect(list.count()).toBe(2);
        expect(list.hasScheduledTick(at(0), 'minecraft:water')).toBe(true);
        expect(list.hasScheduledTick(at(0), 'minecraft:lava')).toBe(false);
    });

    it('reports a tick in the running batch through willTickThisTick', () => {
        const list = new TickList();
        list.schedule(at(0), 'first', 1);
        list.schedule(at(1), 'second', 1);

        const seen: boolean[] = [];
        list.tick(1, () => {
            seen.push(list.willTickThisTick(at(1), 'second'));
        });

        expect(seen).toEqual([true, false]);
        expect(list.willTickThisTick(at(1), 'second')).toBe(false);
    });

    it('snapshots pending ticks in drain order without exposing the live queue', () => {
        const list = new TickList();
        list.schedule(at(3), 'later', 8);
        list.schedule(at(2), 'earlier-late-priority', 3, TICK_PRIORITIES.LOW);
        list.schedule(at(1), 'earlier-high-priority', 3, TICK_PRIORITIES.HIGH);

        const snapshot = list.snapshot();

        expect(
            snapshot.map(({ type, at: position, triggerTick, priority, subTickOrder }) => [
                type,
                position,
                triggerTick,
                priority,
                subTickOrder
            ])
        ).toEqual([
            ['earlier-high-priority', at(1), 3, TICK_PRIORITIES.HIGH, 2],
            ['earlier-late-priority', at(2), 3, TICK_PRIORITIES.LOW, 1],
            ['later', at(3), 8, TICK_PRIORITIES.NORMAL, 0]
        ]);
        Reflect.set(snapshot[0]!.at, 'x', 99);
        expect(list.snapshot()[0]!.at.x).toBe(1);
        expect(list.count()).toBe(3);
    });

    it('leaves a tick scheduled during the batch for a later game tick', () => {
        const list = new TickList();
        list.schedule(at(0), 'chain', 1);

        const ran = list.tick(1, () => {
            list.schedule(at(1), 'chain', 1);
        });

        expect(ran).toBe(1);
        expect(list.count()).toBe(1);
    });

    it('stops at the per-tick budget and runs the rest next tick', () => {
        const list = new TickList();
        for (let i = 0; i < 5; i++) list.schedule(at(i), 'bulk', 1);

        expect(drain(list, 1, 2)).toEqual(['bulk@0', 'bulk@1']);
        expect(list.count()).toBe(3);
        expect(drain(list, 2, 2)).toEqual(['bulk@2', 'bulk@3']);
    });

    it('collects the oldest overdue ticks first when the budget bites', () => {
        const list = new TickList();
        list.schedule(at(0), 'late', 9);
        list.schedule(at(1), 'early', 3);

        expect(drain(list, 10, 1)).toEqual(['early@1']);
    });

    it('matches the prior drain order across generated queues, budgets, and handler scheduling', () => {
        let randomState = 0x51c0ffee;
        const random = (limit: number): number => {
            randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
            return randomState % limit;
        };

        for (let sample = 0; sample < 40; sample++) {
            const actual = new TickList();
            const reference: ReferenceTickList = { queue: [], queued: new Set(), nextOrder: 0 };

            for (let index = 0; index < 80; index++) {
                const position = at(random(32) - 16, random(5) - 2, random(32) - 16);
                const type = `type:${random(6)}`;
                const triggerTick = random(8) + 1;
                const priority = random(7) - 3;
                expect(actual.schedule(position, type, triggerTick, priority)).toBe(
                    referenceSchedule(reference, position, type, triggerTick, priority)
                );
            }

            for (let currentTick = 1; currentTick <= 8; currentTick++) {
                const maxTicks = random(7);
                const actualRun: string[] = [];
                const referenceRun: string[] = [];
                const runActual = (tick: ScheduledTick): void => {
                    actualRun.push(tickSignature(tick));
                    if (tick.type !== 'followup' && tick.subTickOrder % 7 === 0) {
                        actual.schedule(at(1000 + tick.subTickOrder), 'followup', currentTick, tick.priority);
                    }
                };
                const runReference = (tick: ScheduledTick): void => {
                    referenceRun.push(tickSignature(tick));
                    if (tick.type !== 'followup' && tick.subTickOrder % 7 === 0) {
                        referenceSchedule(
                            reference,
                            at(1000 + tick.subTickOrder),
                            'followup',
                            currentTick,
                            tick.priority
                        );
                    }
                };

                expect(actual.tick(currentTick, runActual, maxTicks)).toBe(
                    referenceTick(reference, currentTick, maxTicks, runReference)
                );
                expect(actualRun).toEqual(referenceRun);
                expect(actual.count()).toBe(reference.queue.length);
            }
        }
    });

    it('removes a due prefix with one splice instead of shifting each due tick', () => {
        const list = new TickList();
        const pending = 1000;
        const due = 125;
        for (let index = 0; index < pending; index++) list.schedule(at(index), 'bulk', index < due ? 1 : 2);

        const splice = vi.spyOn(Array.prototype, 'splice');
        try {
            expect(list.tick(1, () => undefined)).toBe(due);
            expect(splice.mock.calls).toEqual([[0, due]]);
            // The one prefix splice moves each of the 875 future entries once, regardless of the due count.
            expect(list.count()).toBe(pending - due);
        } finally {
            splice.mockRestore();
        }
    });

    it('drops queued ticks at a position that was cleared', () => {
        const list = new TickList();
        list.schedule(at(0), 'minecraft:fire', 1);
        list.schedule(at(1), 'minecraft:fire', 1);
        list.clearAt(at(0));

        expect(drain(list, 1)).toEqual(['minecraft:fire@1']);
        expect(list.hasScheduledTick(at(0), 'minecraft:fire')).toBe(false);
    });

    it('uses the jar budget of 65536 ticks per list by default', () => {
        expect(MAX_SCHEDULED_TICKS_PER_TICK).toBe(65536);
    });
});

describe('TickScheduler', () => {
    it('snapshots block and fluid queues separately', () => {
        const scheduler = new TickScheduler();
        scheduler.list('fluid').schedule(at(0), 'minecraft:water', 4);
        scheduler.list('block').schedule(at(1), 'minecraft:repeater', 3);

        expect(scheduler.snapshot()).toEqual({
            block: [{ type: 'minecraft:repeater', at: at(1), triggerTick: 3, priority: 0, subTickOrder: 0 }],
            fluid: [{ type: 'minecraft:water', at: at(0), triggerTick: 4, priority: 0, subTickOrder: 0 }]
        });
    });

    it('runs every block tick before any fluid tick, as ServerLevel.tick does', () => {
        const scheduler = new TickScheduler();
        scheduler.list('fluid').schedule(at(0), 'minecraft:water', 1, TICK_PRIORITIES.EXTREMELY_HIGH);
        scheduler.list('block').schedule(at(1), 'minecraft:repeater', 1, TICK_PRIORITIES.EXTREMELY_LOW);

        const ran: string[] = [];
        const count = scheduler.tick(1, (kind, tick) => ran.push(`${kind}:${tick.type}`));

        expect(ran).toEqual(['block:minecraft:repeater', 'fluid:minecraft:water']);
        expect(count).toBe(2);
    });

    it('leaves the ticks a spent deadline cut off queued and due, first in line next tick', () => {
        const list = new TickList();
        for (let x = 0; x < 5; x += 1) list.schedule(at(x), 'minecraft:oak_leaves', 1, TICK_PRIORITIES.NORMAL);

        const ran: number[] = [];
        let now = 0;
        const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
        try {
            const count = list.tick(
                1,
                (scheduled) => {
                    ran.push(scheduled.at.x);
                    now += 10;
                },
                undefined,
                25
            );
            // The deadline passes after the third tick, so two are left, not lost.
            expect(count).toBe(3);
            expect(ran).toEqual([0, 1, 2]);
            expect(list.count()).toBe(2);
            expect(list.hasScheduledTick(at(3), 'minecraft:oak_leaves')).toBe(true);

            expect(drain(list, 2)).toEqual(['minecraft:oak_leaves@3', 'minecraft:oak_leaves@4']);
        } finally {
            clock.mockRestore();
        }
    });
});
