import { describe, expect, it } from 'vitest';

import type { Module } from '@jsprismarine/kernel';
import { Kernel } from '@jsprismarine/kernel';
import { startTestModule } from '@jsprismarine/kernel/testing';
import { testPlatform } from '../stats/serverRegistry.test.helper';
import { manualTimer, recordingLogger } from '../stats/stats.test.helper';
import type { StatsProvider, StatsProviderContext } from '../stats/StatsProvider';
import { PROVIDER_STOP_TIMEOUT_MS, statsModule, statsProvidersModule } from './stats';
import { statsToken } from './tokens';

/** A provider that records its starts, its stops and the context it was given. */
const recordingProvider = (id: string, calls: string[] = []) => {
    const contexts: StatsProviderContext[] = [];
    const provider: StatsProvider = {
        id,
        start: (context) => {
            calls.push(`start ${id}`);
            contexts.push(context);
        },
        stop: () => void calls.push(`stop ${id}`)
    };
    return { provider, calls, contexts };
};

/** A kernel holding the registry module, the given modules and the providers module, in that order. */
const statsKernel = (providers: readonly StatsProvider[], modules: readonly Module[] = [], timer = manualTimer()) => {
    const { lines, logger } = recordingLogger();
    const kernel = new Kernel({ logger });
    kernel.register(statsModule({ platform: () => testPlatform }));
    for (const module of modules) kernel.register(module);
    kernel.register(statsProvidersModule({ providers, setTimer: timer.setTimer }));
    return { kernel, lines, timer };
};

describe('modules/stats', () => {
    it('provides a registry with the platform and the metrics it was given', async () => {
        const handle = await startTestModule(
            statsModule({
                platform: () => testPlatform,
                metrics: [{ name: 'test:players', kind: 'gauge', description: 'Players.', read: () => 2 }]
            }),
            { logger: recordingLogger().logger }
        );
        try {
            const snapshot = handle.get(statsToken).snapshot();
            expect(snapshot.platform).toBe(testPlatform);
            expect(Object.fromEntries(snapshot.metrics)).toEqual({
                'test:players': { kind: 'gauge', value: 2, description: 'Players.' }
            });
        } finally {
            await handle.stop();
        }
    });

    it('starts and stops a provider once per kernel start', async () => {
        const { provider, calls } = recordingProvider('stub');
        const { kernel, timer } = statsKernel([provider]);
        await kernel.start();
        await timer.advance(0);
        expect(calls).toEqual(['start stub']);

        await kernel.stop();
        expect(calls).toEqual(['start stub', 'stop stub']);

        await kernel.start();
        await timer.advance(0);
        await kernel.stop();
        expect(calls).toEqual(['start stub', 'stop stub', 'start stub', 'stop stub']);
    });

    it('hands the provider the registry, a scoped logger and the timer', async () => {
        const { provider, contexts } = recordingProvider('stub');
        const { kernel, lines, timer } = statsKernel([provider]);
        await kernel.start();
        await timer.advance(0);
        try {
            const [context] = contexts;
            expect(context?.registry).toBe(kernel.get(statsToken));
            expect(context?.setTimer).toBe(timer.setTimer);
            expect(Object.keys(context ?? {}).sort()).toEqual(['logger', 'registry', 'setTimer']);

            context?.logger.info('hello');
            expect(lines.at(-1)).toBe('info: [prismarine:stats-providers] [stub] hello');
        } finally {
            await kernel.stop();
        }
    });

    it('starts providers in order and stops them in reverse', async () => {
        const calls: string[] = [];
        const first = recordingProvider('first', calls);
        const second = recordingProvider('second', calls);
        const { kernel, timer } = statsKernel([first.provider, second.provider]);
        await kernel.start();
        await timer.advance(0);
        await kernel.stop();

        expect(calls).toEqual(['start first', 'start second', 'stop second', 'stop first']);
    });

    it('logs a provider that fails to start, stops it and keeps the server up', async () => {
        const calls: string[] = [];
        const broken: StatsProvider = {
            id: 'broken',
            start: () => {
                throw new Error('no network');
            },
            stop: () => void calls.push('stop broken')
        };
        const working = recordingProvider('working', calls);
        const { kernel, lines, timer } = statsKernel([broken, working.provider]);

        await kernel.start();
        await timer.advance(0);
        await kernel.stop();

        expect(calls).toEqual(['stop broken', 'start working', 'stop working']);
        expect(lines.filter((line) => line.startsWith('warn:'))).toEqual([
            'warn: [prismarine:stats-providers] Stats provider broken failed to start: no network'
        ]);
    });

    it('logs a provider that fails to stop and still stops the rest', async () => {
        const calls: string[] = [];
        const first = recordingProvider('first', calls);
        const broken: StatsProvider = {
            id: 'broken',
            start: () => void calls.push('start broken'),
            stop: () => {
                throw new Error('stuck');
            }
        };
        const { kernel, lines } = statsKernel([first.provider, broken]);

        await kernel.start();
        await kernel.stop();

        expect(calls).toEqual(['start first', 'start broken', 'stop first']);
        expect(lines).toContain('warn: [prismarine:stats-providers] Stats provider broken failed to stop: stuck');
    });

    it('stops a provider whose start was still pending when the kernel stopped, and starts no later one', async () => {
        const calls: string[] = [];
        let finishStart: () => void = () => {};
        const timer = manualTimer();
        /** Waits for its start to be released, then schedules a timer, as a provider that opens I/O first. */
        let cancel: (() => void) | undefined;
        const slow: StatsProvider = {
            id: 'slow',
            start: async (context) => {
                calls.push('start slow');
                await new Promise<void>((resolve) => (finishStart = resolve));
                cancel = context.setTimer(() => calls.push('slow fired'), 1000);
                calls.push('slow started');
            },
            stop: () => {
                calls.push('stop slow');
                cancel?.();
                cancel = undefined;
            }
        };
        const later = recordingProvider('later', calls);
        const { kernel } = statsKernel([slow, later.provider], [], timer);

        await kernel.start();
        await timer.advance(0);
        expect(calls).toEqual(['start slow']);

        await kernel.stop();
        expect(calls).toEqual(['start slow', 'stop slow']);

        finishStart();
        await timer.advance(0);
        expect(calls).toEqual(['start slow', 'stop slow', 'slow started', 'stop slow']);
        expect(timer.pending.size).toBe(0);
        await timer.advance(10_000);
        expect(calls).not.toContain('slow fired');
        expect(calls).not.toContain('start later');
    });

    it('starts the server while a provider start never settles, and stops that provider with it', async () => {
        const calls: string[] = [];
        const stuck: StatsProvider = {
            id: 'stuck',
            start: () => {
                calls.push('start stuck');
                return new Promise<void>(() => {});
            },
            stop: () => void calls.push('stop stuck')
        };
        const later = recordingProvider('later', calls);
        const { kernel, timer } = statsKernel([stuck, later.provider]);

        await kernel.start();
        await timer.advance(0);
        expect(calls).toEqual(['start stuck']);

        await kernel.stop();
        expect(calls).toEqual(['start stuck', 'stop stuck']);
    });

    it('stops waiting for a provider whose stop never settles, and stops the rest', async () => {
        const calls: string[] = [];
        const stuck: StatsProvider = {
            id: 'stuck',
            start: () => {},
            stop: () => {
                calls.push('stop stuck');
                return new Promise<void>(() => {});
            }
        };
        const first = recordingProvider('first', calls);
        const { kernel, lines, timer } = statsKernel([first.provider, stuck]);
        await kernel.start();
        await timer.advance(0);

        let stopped = false;
        const stopping = kernel.stop().then(() => {
            stopped = true;
        });
        await timer.advance(PROVIDER_STOP_TIMEOUT_MS - 1);
        expect(stopped).toBe(false);
        expect(calls).toEqual(['start first', 'stop stuck']);

        await timer.advance(1);
        await stopping;
        expect(calls).toEqual(['start first', 'stop stuck', 'stop first']);
        expect(lines.filter((line) => line.startsWith('warn:'))).toEqual([
            'warn: [prismarine:stats-providers] Stats provider stuck did not stop within 5 seconds, so the server carries on without it'
        ]);
        expect(timer.pending.size).toBe(0);
    });

    it('still stops a provider whose start failed when the kernel stops during its cleanup', async () => {
        const calls: string[] = [];
        let finishStop: () => void = () => {};
        /** Fails to start, and its first stop waits to be released, as a cleanup that closes I/O. */
        const broken: StatsProvider = {
            id: 'broken',
            start: () => {
                throw new Error('no network');
            },
            stop: () => {
                calls.push('stop broken');
                if (calls.length > 1) return;
                return new Promise<void>((resolve) => {
                    finishStop = resolve;
                });
            }
        };
        const { kernel, timer } = statsKernel([broken]);
        await kernel.start();
        await timer.advance(0);
        expect(calls).toEqual(['stop broken']);

        // The cleanup is still pending, so the kernel stop finds the provider and stops it too.
        const stopping = kernel.stop();
        await timer.advance(0);
        expect(calls).toEqual(['stop broken', 'stop broken']);

        finishStop();
        await stopping;
        await timer.advance(0);
        expect(timer.pending.size).toBe(0);
    });

    it('lets a start the kernel stopped finish before the next start launches the same provider', async () => {
        const calls: string[] = [];
        const releases: (() => void)[] = [];
        const timer = manualTimer();
        let cancel: (() => void) | undefined;
        /** Each start waits to be released, then schedules its report. */
        const slow: StatsProvider = {
            id: 'slow',
            start: async (context) => {
                const run = releases.length + 1;
                calls.push(`start ${run}`);
                await new Promise<void>((resolve) => releases.push(resolve));
                cancel = context.setTimer(() => calls.push(`fired ${run}`), 1000);
                calls.push(`started ${run}`);
            },
            stop: () => {
                calls.push('stop');
                cancel?.();
                cancel = undefined;
            }
        };
        const { kernel } = statsKernel([slow], [], timer);

        await kernel.start();
        await timer.advance(0);
        await kernel.stop();
        await kernel.start();
        await timer.advance(0);
        // The second start has not reached the provider: the first is still pending.
        expect(calls).toEqual(['start 1', 'stop']);

        releases[0]?.();
        await timer.advance(0);
        expect(calls).toEqual(['start 1', 'stop', 'started 1', 'stop', 'start 2']);

        releases[1]?.();
        await timer.advance(0);
        expect(calls.at(-1)).toBe('started 2');
        expect(timer.pending.size).toBe(1);
        await timer.advance(1000);
        expect(calls.at(-1)).toBe('fired 2');

        await kernel.stop();
    });

    it('lets another module register a metric through statsToken that survives a kernel restart', async () => {
        const seen: unknown[] = [];
        const reader: StatsProvider = {
            id: 'reader',
            start: (context) => void seen.push(context.registry.read('myaddon:things')?.value),
            stop: () => {}
        };
        let things = 1;
        let dispose: (() => void) | undefined;
        const addon: Module = {
            id: 'test:addon',
            dependencies: [statsToken],
            register: () => {},
            start: (ctx) => {
                dispose = ctx.use(statsToken).register({
                    name: 'myaddon:things',
                    kind: 'gauge',
                    description: 'Things.',
                    read: () => things
                });
            },
            stop: () => {
                dispose?.();
                dispose = undefined;
            }
        };
        const { kernel } = statsKernel([reader], [addon]);

        await kernel.start();
        await kernel.stop();
        expect(kernel.get(statsToken).read('myaddon:things')).toBeUndefined();

        things = 2;
        await kernel.start();
        expect(kernel.get(statsToken).snapshot().metrics.get('myaddon:things')?.value).toBe(2);
        await kernel.stop();

        expect(seen).toEqual([1, 2]);
    });
});
