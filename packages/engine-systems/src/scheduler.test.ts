import { describe, expect, it } from 'vitest';

import { MAX_SCHEDULED_TICKS_PER_TICK, TICK_PRIORITIES, TickList, TickScheduler } from './scheduler';
import type { BlockPosition } from './world';

const at = (x: number, y = 0, z = 0): BlockPosition => ({ x, y, z });

const drain = (list: TickList, tick: number, maxTicks?: number): string[] => {
    const ran: string[] = [];
    list.tick(tick, (scheduled) => ran.push(`${scheduled.type}@${scheduled.at.x}`), maxTicks);
    return ran;
};

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
    it('runs every block tick before any fluid tick, as ServerLevel.tick does', () => {
        const scheduler = new TickScheduler();
        scheduler.list('fluid').schedule(at(0), 'minecraft:water', 1, TICK_PRIORITIES.EXTREMELY_HIGH);
        scheduler.list('block').schedule(at(1), 'minecraft:repeater', 1, TICK_PRIORITIES.EXTREMELY_LOW);

        const ran: string[] = [];
        const count = scheduler.tick(1, (kind, tick) => ran.push(`${kind}:${tick.type}`));

        expect(ran).toEqual(['block:minecraft:repeater', 'fluid:minecraft:water']);
        expect(count).toBe(2);
    });
});
