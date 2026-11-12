import type { Module, ModuleContext } from '@jsprismarine/kernel';
import { scopedLogger } from '@jsprismarine/kernel';

import type { StatsMetric } from '../stats/StatsMetric';
import type { StatsPlatform } from '../stats/StatsPlatform';
import type { StatsProvider, StatsProviderContext, StatsTimer } from '../stats/StatsProvider';
import { StatsRegistry } from '../stats/StatsRegistry';
import { errorMessage } from '../utils/errorMessage';
import { statsToken } from './tokens';

/** The metrics the registry starts with and where it reads the host description from. */
export interface StatsModuleOptions {
    /**
     * Metrics registered while the module registers, for the whole life of the kernel. The server
     * passes its own here. A module that registers in its `start()` disposes in its `stop()`.
     */
    readonly metrics?: readonly StatsMetric[];
    /** Reads the host description; `node:os` by default. */
    readonly platform?: () => StatsPlatform;
}

/**
 * Provides the {@link StatsRegistry} as `prismarine:stats`, with the given metrics in it. It does
 * nothing on start or stop, so register it first: any module can then depend on `statsToken` and
 * register a metric in its own `register()` or `start()`.
 * @param options - The metrics and the platform reader.
 * @returns The module to register on the kernel.
 */
export const statsModule = ({ metrics = [], platform }: StatsModuleOptions = {}): Module => ({
    id: 'prismarine:stats',
    register: (ctx) => {
        const registry = new StatsRegistry({ logger: ctx.logger, ...(platform === undefined ? {} : { platform }) });
        for (const metric of metrics) registry.register(metric);
        ctx.provide(statsToken, registry);
    }
});

/** The providers the server runs and the timer they schedule their reports on. */
export interface StatsProvidersModuleOptions {
    /** Started in order on every kernel start, and stopped in reverse on every kernel stop. */
    readonly providers: readonly StatsProvider[];
    /** An unreferenced `setTimeout` by default, so a pending report never holds the process open. */
    readonly setTimer?: StatsTimer;
}

/** How long a provider's `stop` may take before the server carries on without it. */
export const PROVIDER_STOP_TIMEOUT_MS = 5000;

const unrefTimer: StatsTimer = (callback, delayMs) => {
    const timer = setTimeout(callback, delayMs);
    timer.unref();
    return () => clearTimeout(timer);
};

/** The providers one kernel start launched, so a stop during that start finds them. */
interface ProvidersRun {
    stopped: boolean;
    /** Each provider whose `start` was called, including one still starting. */
    readonly started: StatsProvider[];
}

/**
 * Starts the stats providers as `prismarine:stats-providers`. It depends on `statsToken`, so the
 * kernel starts it after the registry module, and registered last it starts after every other
 * module the server registers, so the metrics those modules register in `start()` are there for
 * a provider's first reading. A provider that throws is logged, stopped and skipped, so stats
 * never stop the server. The providers start in the background, one after another, so a provider
 * whose start never settles holds up only the providers after it and never the server. A kernel
 * stop while a provider is still starting stops that provider, and the providers after it never
 * start. The next kernel start launches its providers once that pending start has finished.
 * @param options - The providers and the timer they schedule on.
 * @returns The module to register on the kernel.
 */
export const statsProvidersModule = ({ providers, setTimer = unrefTimer }: StatsProvidersModuleOptions): Module => {
    let current: ProvidersRun | undefined;
    /** Settles once every start so far has finished, a teardown after a late stop included. */
    let previous: Promise<void> = Promise.resolve();
    /** Stops a provider, waiting no longer than the timeout, so a stop that hangs cannot hold up a shutdown. */
    const stopProvider = async (ctx: ModuleContext, provider: StatsProvider) => {
        const timedOut = Promise.withResolvers<'timed-out'>();
        const cancel = setTimer(() => timedOut.resolve('timed-out'), PROVIDER_STOP_TIMEOUT_MS);
        try {
            const outcome = await Promise.race([Promise.resolve().then(() => provider.stop()), timedOut.promise]);
            if (outcome === 'timed-out') {
                ctx.logger.warn(
                    `Stats provider ${provider.id} did not stop within ${PROVIDER_STOP_TIMEOUT_MS / 1000} seconds, so the server carries on without it`
                );
            }
        } catch (error: unknown) {
            ctx.logger.warn(`Stats provider ${provider.id} failed to stop: ${errorMessage(error)}`);
        } finally {
            cancel();
        }
    };
    const startProviders = async (ctx: ModuleContext, registry: StatsRegistry, run: ProvidersRun) => {
        for (const provider of providers) {
            if (run.stopped) return;
            const context: StatsProviderContext = {
                registry,
                logger: scopedLogger(ctx.logger, provider.id),
                setTimer
            };
            // Recorded first, so a stop that arrives while this start is pending stops it.
            run.started.push(provider);
            try {
                await provider.start(context);
            } catch (error: unknown) {
                ctx.logger.warn(`Stats provider ${provider.id} failed to start: ${errorMessage(error)}`);
                // A start that failed partway may have left a timer running. The provider stays
                // recorded until this cleanup settles, so a kernel stop that arrives meanwhile
                // still finds it and stops it.
                await stopProvider(ctx, provider);
                // Gone already when that kernel stop ran.
                const index = run.started.indexOf(provider);
                if (index !== -1) run.started.splice(index, 1);
                continue;
            }
            // The stop ran while this start was pending, so anything the start set up after
            // that stop is still running.
            if (run.stopped) await stopProvider(ctx, provider);
        }
    };
    return {
        id: 'prismarine:stats-providers',
        dependencies: [statsToken],
        register: () => {},
        start: (ctx) => {
            const registry = ctx.use(statsToken);
            const run: ProvidersRun = { stopped: false, started: [] };
            current = run;
            // Not awaited: a provider whose start never settles must not keep the server from
            // starting. Chained on the start before it, which may still be pending after a stop,
            // so its late teardown stops its own providers and not the ones this start launches.
            previous = previous
                .then(() => startProviders(ctx, registry, run))
                .catch((error: unknown) => {
                    ctx.logger.warn(`Stats providers failed to start: ${errorMessage(error)}`);
                });
        },
        stop: async (ctx) => {
            const run = current;
            current = undefined;
            if (!run) return;
            run.stopped = true;
            for (const provider of run.started.splice(0).reverse()) await stopProvider(ctx, provider);
        }
    };
};
