import type { KernelLogger } from '@jsprismarine/kernel';

import type { BStatsSettings } from '../../config/Config';
import { errorMessage } from '../../utils/errorMessage';
import type { StatsProvider, StatsProviderContext } from '../StatsProvider';
import { buildPayload, buildRequest } from './payload';

const MINUTE_MS = 60_000;

/**
 * The submit timing of bStats' reference clients, `MetricsBase.java` and `bstats-pmmp`. bStats
 * bans a service that changes the delays or the period, so keep these as they are. The docs quote
 * them.
 */
export const BSTATS_SCHEDULE = {
    /** The first submit comes this long after the start, plus up to `firstDelaySpreadMs`. */
    firstDelayMinMs: 3 * MINUTE_MS,
    firstDelaySpreadMs: 3 * MINUTE_MS,
    /** The repeating submit starts up to this long after the first submit. */
    secondDelaySpreadMs: 30 * MINUTE_MS,
    /** The time between repeating submits. */
    periodMs: 30 * MINUTE_MS
} as const;

/** How long a submit may take, from sending the request to reading the answer. */
const REQUEST_TIMEOUT_MS = 10_000;

/** The status bStats answers a second submit with when it lands in the same 30-minute window. */
const TOO_MANY_REQUESTS = 429;

/** Why bStats does not report on a start, and how loudly to say so. */
export interface BStatsOff {
    readonly level: 'debug' | 'info' | 'warn';
    readonly message: string;
}

/** The `stats.bstats` switches that say what a submit logs. */
export type BStatsLogSettings = Pick<BStatsSettings, 'log-errors' | 'log-sent-data' | 'log-response-status-text'>;

/** What a {@link BStatsProvider} is built from. */
export interface BStatsProviderOptions {
    /**
     * Reads the server UUID, sent as `serverUUID`, at each start. Undefined means the server could
     * not store one, and the provider stays off, since a UUID that changes on every start would
     * count the server more than once.
     */
    readonly serverUuid: () => string | undefined;
    /** Decides at each start whether bStats reports: why it is off, or undefined when it reports. */
    readonly gate: () => BStatsOff | undefined;
    /** Reads the logging switches at each start. */
    readonly settings: () => BStatsLogSettings;
    /** Runs on a start that will report, before the first submit is scheduled, such as to log a notice. */
    readonly onReport?: (logger: KernelLogger) => void;
    /** Sends a request. The global `fetch` by default. */
    readonly fetch?: typeof fetch;
    /** A random number in `[0, 1)`, which spreads the submit times. `Math.random` by default. */
    readonly random?: () => number;
}

/** The state of one start, so a timer or a request that settles after `stop()` finds it stopped. */
interface Run {
    readonly context: StatsProviderContext;
    readonly serverUuid: string;
    readonly settings: BStatsLogSettings;
    stopped: boolean;
    /** Cancels the next scheduled submit. */
    cancelNext: () => void;
    /** The requests in flight, each with the function that cancels its timeout. */
    readonly requests: Map<AbortController, () => void>;
}

/**
 * Reports the server's metrics to bStats as the `JSPrismarine` server implementation. It submits
 * once a random 3 to 6 minutes after it starts, then starts a repeating submit a further random 0
 * to 30 minutes later that runs every 30 minutes. A failed submit is logged only when
 * `log-errors` is on, and never throws into the server or stops the schedule.
 *
 * It reads the gate, the UUID and the settings at each start. Nothing it reads can change while
 * it runs: `/reload` stops the kernel, reads the config again and starts the provider anew.
 */
export class BStatsProvider implements StatsProvider {
    public readonly id = 'bstats';
    private readonly options: BStatsProviderOptions;
    private readonly fetch: typeof fetch;
    private readonly random: () => number;
    private run: Run | undefined;

    public constructor(options: BStatsProviderOptions) {
        this.options = options;
        this.fetch = options.fetch ?? globalThis.fetch;
        this.random = options.random ?? Math.random;
    }

    /** Schedules the first submit, or logs why bStats is off and schedules nothing. */
    public start(context: StatsProviderContext): void {
        this.stop();
        const off = this.options.gate();
        if (off) {
            context.logger[off.level](off.message);
            return;
        }
        const serverUuid = this.options.serverUuid();
        if (serverUuid === undefined) {
            context.logger.info(
                'bStats is off because the server UUID could not be stored, and a new UUID on every start would count this server more than once'
            );
            return;
        }
        this.options.onReport?.(context.logger);

        const firstDelayMs = BSTATS_SCHEDULE.firstDelayMinMs + this.random() * BSTATS_SCHEDULE.firstDelaySpreadMs;
        const secondDelayMs = this.random() * BSTATS_SCHEDULE.secondDelaySpreadMs;
        const run: Run = {
            context,
            serverUuid,
            settings: this.options.settings(),
            stopped: false,
            cancelNext: () => {},
            requests: new Map()
        };
        this.run = run;

        const schedule = (delayMs: number, nextDelayMs: number) => {
            run.cancelNext = context.setTimer(() => {
                if (run.stopped) return;
                schedule(nextDelayMs, BSTATS_SCHEDULE.periodMs);
                void this.submit(run);
            }, delayMs);
        };
        schedule(firstDelayMs, secondDelayMs);
    }

    /** Cancels the next submit and aborts any request in flight. Nothing is logged after it. */
    public stop(): void {
        const run = this.run;
        if (!run) return;
        this.run = undefined;
        run.stopped = true;
        run.cancelNext();
        for (const [controller, cancelTimeout] of run.requests) {
            cancelTimeout();
            controller.abort(new Error('the server stopped'));
        }
        run.requests.clear();
    }

    /** Sends one snapshot. Resolves in every case, so a failure never reaches the caller. */
    private async submit(run: Run): Promise<void> {
        const { context, settings } = run;
        const controller = new AbortController();
        const cancelTimeout = context.setTimer(
            () => controller.abort(new Error(`no answer within ${REQUEST_TIMEOUT_MS / 1000} seconds`)),
            REQUEST_TIMEOUT_MS
        );
        run.requests.set(controller, cancelTimeout);
        const log = (level: 'info' | 'warn', message: string) => {
            if (!run.stopped) context.logger[level](message);
        };
        try {
            const payload = buildPayload(context.registry.snapshot(), run.serverUuid);
            const { url, init } = buildRequest(payload);
            if (settings['log-sent-data']) log('info', `Sending bStats data: ${JSON.stringify(payload)}`);

            const response = await this.fetch(url, { ...init, signal: controller.signal });
            if (response.status === TOO_MANY_REQUESTS) {
                await response.body?.cancel();
                // Expected now and then: bStats keeps one submit per server in each 30-minute window.
                if (settings['log-errors']) {
                    log(
                        'info',
                        'bStats already has a submit from this server in this 30-minute window and skipped this one'
                    );
                }
                return;
            }
            if (!response.ok) {
                await response.body?.cancel();
                throw new Error(`bStats answered ${response.status} ${response.statusText}`);
            }
            if (settings['log-response-status-text']) {
                log('info', `bStats answered ${response.status}: ${await response.text()}`);
            } else {
                await response.body?.cancel();
            }
        } catch (error: unknown) {
            if (settings['log-errors']) log('warn', `Could not submit bStats data: ${errorMessage(error)}`);
        } finally {
            cancelTimeout();
            run.requests.delete(controller);
        }
    }
}
