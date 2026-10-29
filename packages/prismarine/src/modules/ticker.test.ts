import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startTestModule } from '@jsprismarine/kernel/testing';
import type { TickEvent } from '../events/Events';
import { ServerTicker, tickerModule } from './ticker';
import type { TickerServer } from './ticker';
import { tickerToken } from './tokens';

/** One tick period of the loop under test, in milliseconds. */
const TICK_MS = 50;

const buildHarness = (overrides: Partial<TickerServer> = {}) => {
    const tickEvents: TickEvent[] = [];
    const warnings: string[] = [];
    let stopping = false;
    const deps: TickerServer = {
        emitTick: async (event) => {
            tickEvents.push(event);
        },
        getWorlds: () => [],
        tickFunctions: async () => 0,
        getChunkScheduler: () => ({
            setBudget: () => {},
            tick: async () => {}
        }),
        getChunkSendBudgetMs: () => 10,
        isTickingEnabled: () => true,
        isProcessTitleEnabled: () => false,
        isHeadless: () => true,
        isStopping: () => stopping,
        getProfileOwner: () => deps,
        getLogger: () => ({
            warn: (message: string) => {
                warnings.push(message);
            },
            verbose: () => {},
            error: () => {}
        }),
        ...overrides
    };
    return {
        ticker: new ServerTicker(deps),
        tickEvents,
        warnings,
        deps,
        setStopping(value: boolean) {
            stopping = value;
        }
    };
};

describe('modules/ticker', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('provides the ticker and ticks at 50 ms, emitting the tick event each tick', async () => {
        const harness = buildHarness();
        const handle = await startTestModule(tickerModule(harness.ticker));
        try {
            expect(handle.get(tickerToken)).toBe(harness.ticker);

            // The first tick runs immediately on start.
            await vi.advanceTimersByTimeAsync(0);
            expect(harness.ticker.getTick()).toBe(1);
            expect(harness.tickEvents.map((event) => event.getTick())).toEqual([0]);

            await vi.advanceTimersByTimeAsync(TICK_MS * 4);
            expect(harness.ticker.getTick()).toBe(5);
            expect(harness.tickEvents.map((event) => event.getTick())).toEqual([0, 1, 2, 3, 4]);
            expect(harness.ticker.getTPS()).toBeCloseTo(20, 0);
        } finally {
            await handle.stop();
        }
    });

    it('does not tick when ticking is disabled', async () => {
        const harness = buildHarness({ isTickingEnabled: () => false });
        const handle = await startTestModule(tickerModule(harness.ticker));
        try {
            await vi.advanceTimersByTimeAsync(TICK_MS * 10);
            expect(harness.ticker.getTick()).toBe(0);
            expect(harness.tickEvents).toHaveLength(0);
        } finally {
            await handle.stop();
        }
    });

    it('stops ticking when the module stops and resumes on a fresh epoch after restart', async () => {
        const harness = buildHarness();
        const handle = await startTestModule(tickerModule(harness.ticker));

        await vi.advanceTimersByTimeAsync(TICK_MS * 2);
        const ticksBeforeStop = harness.ticker.getTick();
        expect(ticksBeforeStop).toBeGreaterThan(0);

        await handle.stop();
        await vi.advanceTimersByTimeAsync(TICK_MS * 10);
        expect(harness.ticker.getTick()).toBe(ticksBeforeStop);

        // A restarted kernel starts the same ticker again; the tick number
        // carries over and the downtime is not repaid as a catch-up burst.
        await handle.start();
        try {
            await vi.advanceTimersByTimeAsync(TICK_MS * 2);
            expect(harness.ticker.getTick()).toBeGreaterThan(ticksBeforeStop);
            expect(harness.warnings).toHaveLength(0);
        } finally {
            await handle.stop();
        }
    });

    it('stops rescheduling once the server reports it is stopping', async () => {
        const harness = buildHarness();
        const handle = await startTestModule(tickerModule(harness.ticker));
        try {
            await vi.advanceTimersByTimeAsync(TICK_MS);
            harness.setStopping(true);
            const ticksBeforeShutdown = harness.ticker.getTick();

            await vi.advanceTimersByTimeAsync(TICK_MS * 10);
            // At most the tick already in flight completes; nothing reschedules.
            expect(harness.ticker.getTick()).toBeLessThanOrEqual(ticksBeforeShutdown + 1);
        } finally {
            await handle.stop();
        }
    });

    it('writes off a backlog beyond two seconds instead of replaying it', async () => {
        const harness = buildHarness();
        // The second tick stalls for 2.5 seconds of fake time, putting the loop
        // past the 2000 ms catch-up limit.
        let stalled = false;
        harness.deps.tickFunctions = async () => {
            if (harness.ticker.getTick() === 1 && !stalled) {
                stalled = true;
                vi.advanceTimersByTime(2500);
            }
            return 0;
        };
        const handle = await startTestModule(tickerModule(harness.ticker));
        try {
            await vi.advanceTimersByTimeAsync(TICK_MS * 3);
            expect(harness.warnings.some((message) => message.startsWith("Can't keep up!"))).toBe(true);

            // The backlog was skipped: after another second the loop has run
            // roughly one tick per period, not two seconds' worth of extras.
            const ticksAfterStall = harness.ticker.getTick();
            await vi.advanceTimersByTimeAsync(1000);
            expect(harness.ticker.getTick() - ticksAfterStall).toBeLessThanOrEqual(21);
        } finally {
            await handle.stop();
        }
    });
});
