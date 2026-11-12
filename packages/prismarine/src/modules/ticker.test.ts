import { KernelEventBus } from '@jsprismarine/kernel';
import type { ServerEvents } from '../events/ServerEvents';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startTestModule } from '@jsprismarine/kernel/testing';
import type TickEvent from '../events/other/TickEvent';
import { attachProfiler, ServerProfiler } from '../profiling/ServerProfiler';
import { ServerTicker, tickerModule } from './ticker';
import type { TickerServer, TickerWorld } from './ticker';
import { tickerToken } from './tokens';
import { ChunkCompletionQueue } from '../world/ChunkCompletionQueue';
import { insideTick } from '../world/TickContext';

/** One tick period of the loop under test, in milliseconds. */
const TICK_MS = 50;

/** A bus with one `tick` listener, for a test that listens in its own way. */
const tickBus = (listener: (event: TickEvent) => unknown) => {
    const events = new KernelEventBus<ServerEvents>();
    events.on('tick', listener);
    return events;
};

const buildHarness = (overrides: Partial<TickerServer> = {}) => {
    const tickEvents: TickEvent[] = [];
    const warnings: string[] = [];
    const completionQueue = new ChunkCompletionQueue();
    let stopping = false;
    // A real bus, so a test adds tick listeners to it as a plugin would.
    const events = new KernelEventBus<ServerEvents>();
    events.on('tick', (event) => void tickEvents.push(event));
    const deps: TickerServer = {
        events,
        admitInputs: () => 0,
        pollNetwork: () => 0,
        getWorlds: () => [],
        tickFunctions: () => 0,
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
        events,
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

    it('runs the input step before anything else in the tick and polls the network last', async () => {
        const order: string[] = [];
        const harness = buildHarness({
            isTickingEnabled: () => false,
            admitInputs: () => {
                order.push('inputs');
                return 0;
            },
            pollNetwork: () => {
                order.push('network');
                return 1;
            },
            events: tickBus(() => {
                order.push('tick');
            }),
            getWorlds: () => [
                {
                    getName: () => 'world',
                    update: () => {
                        order.push('world');
                    }
                }
            ],
            tickFunctions: () => {
                order.push('functions');
                return 0;
            }
        });

        await harness.ticker.advance();

        // Worker records polled at the end of one tick reach the input step of the next, as a
        // frame the socket transport delivers during the tick does.
        expect(order).toEqual(['inputs', 'functions', 'tick', 'world', 'network']);
    });

    it('opens each world change log tick before the input step and closes it after the world updates', async () => {
        const order: string[] = [];
        const harness = buildHarness({
            isTickingEnabled: () => false,
            admitInputs: () => {
                order.push('inputs');
                return 0;
            },
            getWorlds: () => [
                {
                    getName: () => 'world',
                    beginChangeTick: () => order.push('begin'),
                    update: () => {
                        order.push('world');
                    },
                    closeTick: () => void order.push('close')
                }
            ]
        });

        await harness.ticker.advance();

        expect(order).toEqual(['begin', 'inputs', 'world', 'close']);
    });

    it('closes every opened world tick when the input step throws', async () => {
        const order: string[] = [];
        const harness = buildHarness({
            isTickingEnabled: () => false,
            admitInputs: () => {
                order.push('inputs');
                throw new Error('planned');
            },
            getWorlds: () => [
                {
                    getName: () => 'world',
                    beginChangeTick: () => order.push('begin'),
                    update: () => {
                        order.push('world');
                    },
                    closeTick: () => void order.push('close')
                }
            ]
        });

        await harness.ticker.advance();
        await harness.ticker.advance();

        expect(order).toEqual(['begin', 'inputs', 'close', 'begin', 'inputs', 'close']);
    });

    it('closes a frozen world in every tick without updating it, and the next world after one that throws', async () => {
        const calls: string[] = [];
        const harness = buildHarness({
            isTickingEnabled: () => false,
            getWorlds: () => [
                {
                    getName: () => 'first',
                    update: () => void calls.push('update:first'),
                    closeTick: (tick) => {
                        calls.push(`close:first:${tick}`);
                        throw new Error('planned');
                    }
                },
                {
                    getName: () => 'second',
                    update: () => void calls.push('update:second'),
                    closeTick: (tick) => void calls.push(`close:second:${tick}`)
                }
            ]
        });
        harness.ticker.setFrozen(true);

        const first = harness.ticker.getTick();
        await harness.ticker.advance();
        await harness.ticker.advance();

        expect(calls).toEqual([
            `close:first:${first}`,
            `close:second:${first}`,
            `close:first:${first + 1}`,
            `close:second:${first + 1}`
        ]);
    });

    it('runs the simulation phases inside the tick, and chunk delivery and the poll outside it', async () => {
        const inside: Record<string, boolean> = {};
        const harness = buildHarness({
            isTickingEnabled: () => false,
            admitInputs: () => {
                inside.inputs = insideTick();
                return 0;
            },
            events: tickBus(() => {
                inside.tick = insideTick();
            }),
            getWorlds: () => [
                {
                    getName: () => 'world',
                    update: () => {
                        inside.world = insideTick();
                    }
                }
            ],
            tickFunctions: () => {
                inside.functions = insideTick();
                return 0;
            },
            getChunkScheduler: () => ({
                setBudget: () => {},
                tick: async () => {
                    inside.chunkScheduler = insideTick();
                }
            }),
            pollNetwork: () => {
                inside.network = insideTick();
                return 0;
            }
        });

        await harness.ticker.advance();

        expect(inside).toEqual({
            inputs: true,
            tick: true,
            world: true,
            functions: true,
            chunkScheduler: false,
            network: false
        });
    });

    it('posts the tick event in the tick, and a tick listener that fails stops nothing', async () => {
        const failures: unknown[] = [];
        const events = new KernelEventBus<ServerEvents>({ onListenerError: (error) => failures.push(error) });
        const order: string[] = [];
        events.on('tick', () => {
            order.push('throws');
            throw new Error('a tick listener failed');
        });
        events.on('tick', async () => {
            order.push('rejects');
            throw new Error('a tick listener rejected');
        });
        events.on('tick', () => void order.push('last'));
        const harness = buildHarness({
            events,
            isTickingEnabled: () => false,
            pollNetwork: () => {
                order.push('network');
                return 0;
            }
        });

        harness.ticker.advance();
        await vi.waitFor(() => expect(failures).toHaveLength(2));

        expect(order.slice(0, 3)).toEqual(['throws', 'rejects', 'last']);
        expect(order).toContain('network');
        expect(harness.ticker.getTick()).toBe(1);
    });

    it('polls the network even when the work of the tick throws', async () => {
        let polled = 0;
        const harness = buildHarness({
            isTickingEnabled: () => false,
            tickFunctions: () => {
                throw new Error('a tick function failed');
            },
            pollNetwork: () => ++polled
        });

        await harness.ticker.advance();

        expect(polled).toBe(1);
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

    it('activates the chunk completions, and drains their preparation after the world updates, outside the tick', async () => {
        const order: string[] = [];
        const queue = {
            activate: () => order.push('activate'),
            deactivate: () => order.push('deactivate'),
            drain: () => {
                order.push(insideTick() ? 'completion inside the tick' : 'completion');
                return 1;
            }
        };
        const harness = buildHarness({
            getChunkCompletionQueue: () => queue,
            getWorlds: () => [
                {
                    getName: () => 'overworld',
                    update: () => {
                        order.push('world');
                    }
                }
            ]
        });
        const handle = await startTestModule(tickerModule(harness.ticker));

        try {
            await vi.advanceTimersByTimeAsync(0);
            expect(order.slice(0, 3)).toEqual(['activate', 'world', 'completion']);
        } finally {
            await handle.stop();
        }

        expect(order.at(-1)).toBe('deactivate');
    });

    it('updates the worlds one after another in order, past one that throws, each to its end', async () => {
        const events: string[] = [];
        const errors: unknown[] = [];
        const failure = new Error('the overworld broke');
        const world = (name: string, work: () => void): TickerWorld => ({
            getName: () => name,
            update: (tick: number) => {
                events.push(`start ${name} ${tick}`);
                try {
                    work();
                } finally {
                    events.push(`end ${name} ${tick}`);
                }
            }
        });
        const harness = buildHarness({
            getWorlds: () => [
                world('overworld', () => {
                    throw failure;
                }),
                world('nether', () => {}),
                world('the_end', () => {})
            ],
            getLogger: () => ({
                warn: () => {},
                verbose: () => {},
                error: (error: unknown) => void errors.push(error)
            })
        });
        const handle = await startTestModule(tickerModule(harness.ticker));
        try {
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
            events: tickBus(() => {
                // A tick handler is not waited for, so the stall is one that holds the thread: the
                // fake clock moves while the handler runs, as a slow synchronous handler's would.
                const stall = blockMs;
                blockMs = 0;
                if (stall > 0) vi.advanceTimersByTime(stall);
            })
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
            getWorlds: () => [{ getName: () => 'overworld', update: () => {} }]
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
        harness.events.on('tick', (event) => {
            eventLoopOrder.push(`tick:${event.getTick()}`);
        });
        harness.deps.tickFunctions = () => {
            if (!stalled) {
                stalled = true;
                vi.advanceTimersByTime(75);
                // Let the queued I/O callback run before the overdue tick resumes.
                setImmediate(() => eventLoopOrder.push('io'));
            }
            return 0;
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
        harness.deps.tickFunctions = () => {
            if (!stalled) {
                stalled = true;
                vi.advanceTimersByTime(75);
            }
            return 0;
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
                        update: (tick: number) => {
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
                expect(vi.getTimerCount()).toBe(0);
                expect(immediate).not.toHaveBeenCalled();
            } finally {
                timeout.restore();
                immediate.restore();
                await handle.stop();
            }
        });

        it('refuses to run beside the loop or from inside the tick it is running', async () => {
            const refused: unknown[] = [];
            const harness = buildHarness({
                isTickingEnabled: () => false,
                events: tickBus(() => {
                    try {
                        harness.ticker.advance();
                    } catch (error: unknown) {
                        refused.push(error);
                    }
                })
            });
            harness.ticker.advance();
            expect(refused).toEqual([new Error('Cannot advance the ticker while a manual tick is in flight')]);
            expect(harness.ticker.getTick()).toBe(1);

            const running = buildHarness();
            const handle = await startTestModule(tickerModule(running.ticker));
            try {
                expect(() => running.ticker.advance()).toThrow('while its loop runs');
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
        harness.deps.tickFunctions = () => {
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
                getWorlds: () => [{ getName: () => 'w', update: (tick) => void updates.push(tick) }],
                tickFunctions: () => {
                    functions.push(1);
                    return 1;
                }
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
                getWorlds: () => [{ getName: () => 'w', update: (tick) => void updates.push(tick) }]
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
