import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startTestModule } from '@jsprismarine/kernel/testing';
import type { TickEvent } from '../events/Events';
import { attachProfiler, ServerProfiler } from '../profiling/ServerProfiler';
import { ServerTicker, tickerModule } from './ticker';
import type { TickerServer } from './ticker';
import { tickerToken } from './tokens';
import { ChunkCompletionQueue } from '../world/ChunkCompletionQueue';

/** One tick period of the loop under test, in milliseconds. */
const TICK_MS = 50;

const buildHarness = (overrides: Partial<TickerServer> = {}) => {
    const tickEvents: TickEvent[] = [];
    const warnings: string[] = [];
    const completionQueue = new ChunkCompletionQueue();
    let stopping = false;
    const deps: TickerServer = {
        emitTick: async (event) => {
            tickEvents.push(event);
        },
        pollNetwork: () => 0,
        getWorlds: () => [],
        tickFunctions: async () => 0,
        getChunkScheduler: () => ({
            setBudget: () => {},
            tick: async () => {}
        }),
        getChunkCompletionQueue: () => completionQueue,
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

/**
 * Records the calls to a faked timer function while the test runs, and puts it back.
 *
 * Not `vi.spyOn`: restoring a spy on a fake-timers function that had been called left the fake in
 * place after `vi.useRealTimers()`, so every later file in the worker had a `setTimeout` that
 * never fired. A plain wrapper, put back by plain assignment before the real timers return,
 * leaves nothing behind.
 */
const recordCalls = <Name extends 'setTimeout' | 'setImmediate'>(name: Name) => {
    const original = globalThis[name];
    const calls = vi.fn(original);
    Object.assign(globalThis, { [name]: calls });
    return Object.assign(calls, {
        restore: () => {
            Object.assign(globalThis, { [name]: original });
        }
    });
};

describe('modules/ticker', () => {
    beforeEach(() => {
        vi.useFakeTimers({
            toFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'clearImmediate', 'performance', 'Date']
        });
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

    it('hands pending worker network records to the game thread before tick handlers', async () => {
        const order: string[] = [];
        const harness = buildHarness({
            pollNetwork: () => {
                order.push('network');
                return 1;
            },
            emitTick: async () => {
                order.push('tick');
            }
        });
        const handle = await startTestModule(tickerModule(harness.ticker));
        try {
            await vi.advanceTimersByTimeAsync(0);
            expect(order.slice(0, 2)).toEqual(['network', 'tick']);
        } finally {
            await handle.stop();
        }
    });

    it('uses a timeout for a tick that finishes before its fixed deadline', async () => {
        const harness = buildHarness();
        const timeout = recordCalls('setTimeout');
        const immediate = recordCalls('setImmediate');
        const handle = await startTestModule(tickerModule(harness.ticker));
        try {
            await vi.advanceTimersByTimeAsync(0);

            expect(timeout.mock.calls.some(([, delay]) => delay === TICK_MS)).toBe(true);
            expect(immediate).not.toHaveBeenCalled();
            expect(harness.ticker.getTick()).toBe(1);
            expect(harness.warnings).toEqual([]);
        } finally {
            await handle.stop();
            timeout.restore();
            immediate.restore();
        }
    });

    it('activates and drains background chunk completions before world updates', async () => {
        const order: string[] = [];
        const queue = {
            activate: () => order.push('activate'),
            deactivate: () => order.push('deactivate'),
            drain: () => {
                order.push('completion');
                return 1;
            }
        };
        const harness = buildHarness({
            getChunkCompletionQueue: () => queue,
            getWorlds: () => [
                {
                    getName: () => 'overworld',
                    update: async () => {
                        order.push('world');
                    }
                }
            ]
        });
        const handle = await startTestModule(tickerModule(harness.ticker));

        try {
            await vi.advanceTimersByTimeAsync(0);
            expect(order.slice(0, 3)).toEqual(['activate', 'completion', 'world']);
        } finally {
            await handle.stop();
        }

        expect(order.at(-1)).toBe('deactivate');
    });

    it('updates the worlds one after another in order, past one that throws, before the next tick', async () => {
        const events: string[] = [];
        const errors: unknown[] = [];
        const failure = new Error('the overworld broke');
        const world = (name: string, work: () => Promise<void>) => ({
            getName: () => name,
            update: async (tick: number) => {
                events.push(`start ${name} ${tick}`);
                try {
                    await work();
                } finally {
                    events.push(`end ${name} ${tick}`);
                }
            }
        });
        const harness = buildHarness({
            getWorlds: () => [
                world('overworld', async () => {
                    throw failure;
                }),
                // Longer than a tick's period: a loop that does not wait for it starts the next
                // tick while this one is still running.
                world('nether', () => new Promise((resolve) => setTimeout(resolve, TICK_MS * 2))),
                world('the_end', async () => {})
            ],
            getLogger: () => ({
                warn: () => {},
                verbose: () => {},
                error: (error: unknown) => void errors.push(error)
            })
        });
        const handle = await startTestModule(tickerModule(harness.ticker));
        try {
            // Room for the first two ticks, each held for two periods by the Nether.
            await vi.advanceTimersByTimeAsync(TICK_MS * 8);
        } finally {
            await handle.stop();
        }

        const ticks = [0, 1];
        expect(events.slice(0, 12)).toEqual(
            ticks.flatMap((tick) =>
                ['overworld', 'nether', 'the_end'].flatMap((name) => [`start ${name} ${tick}`, `end ${name} ${tick}`])
            )
        );
        expect(errors).toContain(failure);
        expect(errors.some((error) => typeof error === 'string' && error.includes('overworld'))).toBe(true);
    });

    it('records how late each tick started against its due time and how long its work took', async () => {
        let blockMs = 0;
        const harness = buildHarness({
            emitTick: async () => {
                // Fake `performance` only moves with the timers, so the stall is advanced by hand.
                if (blockMs > 0) await vi.advanceTimersByTimeAsync(blockMs);
                blockMs = 0;
            }
        });
        const handle = await startTestModule(tickerModule(harness.ticker));
        try {
            await vi.advanceTimersByTimeAsync(0);
            blockMs = 120;
            await vi.advanceTimersByTimeAsync(TICK_MS * 6);

            const samples = harness.ticker.recorder.between(0);
            expect(samples.length).toBeGreaterThanOrEqual(3);
            expect(samples[0]!.latenessMs).toBe(0);
            // The first tick after the stalled one is due 50 ms after the stalled tick started.
            const stalled = samples.find((sample) => sample.elapsedMs >= 100)!;
            expect(stalled.tickHandlersMs).toBeGreaterThanOrEqual(100);
            const next = samples.find((sample) => sample.tick === stalled.tick + 1)!;
            expect(next.latenessMs).toBeGreaterThanOrEqual(60);
        } finally {
            await handle.stop();
        }
    });

    it('closes every tick profiling span when profiling is enabled', async () => {
        const directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-ticker-profile-'));
        vi.stubEnv('JSP_DIR', directory);
        const harness = buildHarness({
            getWorlds: () => [{ getName: () => 'overworld', update: async () => {} }]
        });
        const profiler = new ServerProfiler();
        attachProfiler(harness.deps, profiler);
        const handle = await startTestModule(tickerModule(harness.ticker));

        try {
            await vi.advanceTimersByTimeAsync(0);
            const file = await profiler.save();
            if (file === undefined) throw new Error('ticker wrote no profile spans');
            // The trace is parsed JSON written by ServerProfiler.save, so its shape is a boundary.
            const trace = JSON.parse(readFileSync(file, 'utf8')) as {
                traceEvents: Array<{ dur?: number; name?: string; ph?: string }>;
            };
            const spans = trace.traceEvents.filter((event) => event.ph === 'X');
            const names = spans.map((span) => span.name);

            expect(names).toEqual(
                expect.arrayContaining([
                    'Server.tick',
                    'Server.tickHandlers',
                    'World.update:overworld',
                    'Server.tickFunctions',
                    'Server.chunkScheduler'
                ])
            );
            expect(spans.every((span) => span.dur !== undefined && span.dur >= 0)).toBe(true);
        } finally {
            await handle.stop();
            vi.unstubAllEnvs();
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('uses an immediate for a late tick, then resumes the same fixed epoch', async () => {
        const harness = buildHarness();
        let stalled = false;
        const eventLoopOrder: string[] = [];
        harness.deps.emitTick = async (event) => {
            harness.tickEvents.push(event);
            eventLoopOrder.push(`tick:${event.getTick()}`);
        };
        harness.deps.tickFunctions = async () => {
            if (!stalled) {
                stalled = true;
                vi.advanceTimersByTime(75);
                // Let the queued I/O callback run before the overdue tick resumes.
                setImmediate(() => eventLoopOrder.push('io'));
            }
        };
        const timeout = recordCalls('setTimeout');
        const immediate = recordCalls('setImmediate');
        const handle = await startTestModule(tickerModule(harness.ticker));
        try {
            await vi.advanceTimersByTimeAsync(0);

            expect(immediate).toHaveBeenCalledTimes(2);
            expect(harness.ticker.getTick()).toBe(2);
            expect(harness.tickEvents.map((event) => event.getTick())).toEqual([0, 1]);
            expect(eventLoopOrder).toEqual(['tick:0', 'io', 'tick:1']);
            expect(timeout.mock.calls.some(([, delay]) => delay === 25)).toBe(true);
            expect(harness.warnings).toEqual([]);
        } finally {
            await handle.stop();
            timeout.restore();
            immediate.restore();
        }
    });

    it('keeps the event loop awake between back-to-back catch-up ticks', async () => {
        const harness = buildHarness();
        let stalled = false;
        harness.deps.tickFunctions = async () => {
            if (!stalled) {
                stalled = true;
                vi.advanceTimersByTime(75);
            }
        };
        const immediate = recordCalls('setImmediate');
        const handle = await startTestModule(tickerModule(harness.ticker));
        try {
            await vi.advanceTimersByTimeAsync(0);

            // An unref'd immediate lets the loop sleep in its poll phase until some other event
            // wakes it, which with the socket on a worker is a timer tens of milliseconds away.
            const scheduled = immediate.mock.results.map((result) => result.value as { hasRef(): boolean });
            expect(scheduled.length).toBeGreaterThan(0);
            expect(scheduled.every((handle) => handle.hasRef())).toBe(true);
        } finally {
            await handle.stop();
            immediate.restore();
        }
    });

    it('holds its first tick until released, as the server does while its transports bind', async () => {
        const harness = buildHarness();
        harness.ticker.hold();
        const handle = await startTestModule(tickerModule(harness.ticker));
        try {
            await vi.advanceTimersByTimeAsync(TICK_MS * 4);
            expect(harness.tickEvents).toHaveLength(0);

            harness.ticker.release();
            await vi.advanceTimersByTimeAsync(0);
            expect(harness.tickEvents.map((event) => event.getTick())).toEqual([0]);
        } finally {
            await handle.stop();
        }
    });

    it('stays stopped when released after the kernel stopped it', async () => {
        const harness = buildHarness();
        harness.ticker.hold();
        const handle = await startTestModule(tickerModule(harness.ticker));
        await handle.stop();

        harness.ticker.release();
        await vi.advanceTimersByTimeAsync(TICK_MS * 4);

        expect(harness.tickEvents).toHaveLength(0);
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

    describe('advance', () => {
        it('runs exactly one tick per call when ticking is disabled, and schedules nothing', async () => {
            const updated: number[] = [];
            const harness = buildHarness({
                isTickingEnabled: () => false,
                getWorlds: () => [
                    {
                        getName: () => 'world',
                        update: async (tick: number) => {
                            updated.push(tick);
                        }
                    }
                ]
            });
            const timeout = recordCalls('setTimeout');
            const immediate = recordCalls('setImmediate');
            const handle = await startTestModule(tickerModule(harness.ticker));
            try {
                await harness.ticker.advance();
                await harness.ticker.advance();
                await harness.ticker.advance();

                expect(harness.ticker.getTick()).toBe(3);
                expect(harness.tickEvents.map((event) => event.getTick())).toEqual([0, 1, 2]);
                expect(updated).toEqual([0, 1, 2]);
                expect(harness.ticker.recorder.between(0).map((sample) => sample.tick)).toEqual([0, 1, 2]);
                // Nothing waits on a timer, so the same calls take the same steps on any host.
                expect(timeout).not.toHaveBeenCalled();
                expect(immediate).not.toHaveBeenCalled();
            } finally {
                timeout.restore();
                immediate.restore();
                await handle.stop();
            }
        });

        it('refuses to run beside the loop or beside another manual tick', async () => {
            let release = (): void => {};
            const harness = buildHarness({
                isTickingEnabled: () => false,
                emitTick: () =>
                    new Promise<void>((resolve) => {
                        release = resolve;
                    })
            });
            const first = harness.ticker.advance();
            await expect(harness.ticker.advance()).rejects.toThrow('manual tick is in flight');
            release();
            await first;
            expect(harness.ticker.getTick()).toBe(1);

            const running = buildHarness();
            const handle = await startTestModule(tickerModule(running.ticker));
            try {
                await expect(running.ticker.advance()).rejects.toThrow('while its loop runs');
            } finally {
                await handle.stop();
            }
        });
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
            expect(harness.warnings).toContain("Can't keep up! Skipping 49 ticks (2450 ms behind)");

            // The backlog was skipped: after another second the loop has run
            // roughly one tick per period, not two seconds' worth of extras.
            const ticksAfterStall = harness.ticker.getTick();
            await vi.advanceTimersByTimeAsync(1000);
            expect(harness.ticker.getTick() - ticksAfterStall).toBeLessThanOrEqual(21);
        } finally {
            await handle.stop();
        }
    });

    describe('tick control', () => {
        it('ticks at the rate it was given', async () => {
            const harness = buildHarness();
            harness.ticker.setTickRate(100);
            const handle = await startTestModule(tickerModule(harness.ticker));
            try {
                await vi.advanceTimersByTimeAsync(1000);
                expect(harness.ticker.getTick()).toBeGreaterThanOrEqual(95);
                expect(harness.ticker.getTick()).toBeLessThanOrEqual(105);
            } finally {
                await handle.stop();
            }
        });

        it('switches rate on a running loop without repaying the old schedule', async () => {
            const harness = buildHarness();
            const handle = await startTestModule(tickerModule(harness.ticker));
            try {
                await vi.advanceTimersByTimeAsync(1000);
                const before = harness.ticker.getTick();
                harness.ticker.setTickRate(200);
                await vi.advanceTimersByTimeAsync(1000);
                const gained = harness.ticker.getTick() - before;
                expect(gained).toBeGreaterThanOrEqual(185);
                expect(gained).toBeLessThanOrEqual(215);
            } finally {
                await handle.stop();
            }
        });

        it('freezes the world and the functions but keeps counting ticks and emitting the event', async () => {
            const updates: number[] = [];
            const functions: number[] = [];
            const harness = buildHarness({
                getWorlds: () => [{ getName: () => 'w', update: async (tick) => void updates.push(tick) }],
                tickFunctions: async () => void functions.push(1)
            });
            const handle = await startTestModule(tickerModule(harness.ticker));
            try {
                await vi.advanceTimersByTimeAsync(TICK_MS * 2);
                harness.ticker.setFrozen(true);
                const worldTicks = updates.length;
                const eventTicks = harness.tickEvents.length;
                await vi.advanceTimersByTimeAsync(TICK_MS * 5);

                expect(updates).toHaveLength(worldTicks);
                expect(functions).toHaveLength(worldTicks);
                expect(harness.tickEvents.length).toBeGreaterThan(eventTicks);

                harness.ticker.setFrozen(false);
                await vi.advanceTimersByTimeAsync(TICK_MS * 2);
                expect(updates.length).toBeGreaterThan(worldTicks);
            } finally {
                await handle.stop();
            }
        });

        it('steps a frozen world by the ticks asked for and then holds still again', async () => {
            const updates: number[] = [];
            const harness = buildHarness({
                getWorlds: () => [{ getName: () => 'w', update: async (tick) => void updates.push(tick) }]
            });
            const handle = await startTestModule(tickerModule(harness.ticker));
            try {
                harness.ticker.setFrozen(true);
                await vi.advanceTimersByTimeAsync(TICK_MS * 2);
                const before = updates.length;

                expect(harness.ticker.step(3)).toBe(true);
                await vi.advanceTimersByTimeAsync(TICK_MS * 10);
                expect(updates.length - before).toBe(3);
                expect(harness.ticker.stopStep()).toBe(false);
            } finally {
                await handle.stop();
            }
        });

        it('refuses to step a world that is running', () => {
            expect(buildHarness().ticker.step(3)).toBe(false);
        });

        it('sprints through the ticks without waiting, then returns to the target rate', async () => {
            const harness = buildHarness();
            const handle = await startTestModule(tickerModule(harness.ticker));
            try {
                await vi.advanceTimersByTimeAsync(0);
                const before = harness.ticker.getTick();
                harness.ticker.sprint(100);
                // A zero delay is one millisecond on a timer, so the burst runs a tick a step.
                for (let step = 0; step < TICK_MS + 110; step++) await vi.advanceTimersByTimeAsync(1);
                expect(harness.ticker.getTick() - before).toBeGreaterThanOrEqual(100);

                const after = harness.ticker.getTick();
                await vi.advanceTimersByTimeAsync(TICK_MS * 4);
                expect(harness.ticker.getTick() - after).toBeLessThanOrEqual(5);
                expect(harness.ticker.stopSprint()).toBe(false);
            } finally {
                await handle.stop();
            }
        });
    });
});
