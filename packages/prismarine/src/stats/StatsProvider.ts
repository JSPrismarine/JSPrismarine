import type { KernelLogger } from '@jsprismarine/kernel';

import type { StatsRegistry } from './StatsRegistry';

/**
 * Runs a callback once after a delay. Returns a function that cancels the callback if it has
 * not run yet, so a provider holds no timer handle type.
 */
export type StatsTimer = (callback: () => void, delayMs: number) => () => void;

/**
 * What the stats module hands a provider when it starts. The timer is injected, so a test drives
 * a provider's schedule on a clock it moves by hand.
 */
export interface StatsProviderContext {
    /** The server's metrics, read with {@link StatsRegistry.snapshot} or {@link StatsRegistry.read}. */
    readonly registry: StatsRegistry;
    /** A logger scoped to the provider's id. */
    readonly logger: KernelLogger;
    /** Schedules a callback; an unreferenced `setTimeout` on a running server. */
    readonly setTimer: StatsTimer;
}

/**
 * Reads the server's metrics and sends them somewhere, as a transport carries sessions. Each
 * provider owns its schedule: one service dictates an interval, and a scrape endpoint has none.
 */
export interface StatsProvider {
    /** A short name for logs, such as `bstats`. */
    readonly id: string;
    /** Starts reporting. Runs on every kernel start. */
    start(context: StatsProviderContext): Promise<void> | void;
    /**
     * Stops reporting and leaves no timer or request pending. Runs on every kernel stop. A stop
     * that arrives while `start` is still pending calls it at once and again when that `start`
     * returns, so it must not assume the start finished, and a second call must be harmless.
     */
    stop(): Promise<void> | void;
}
