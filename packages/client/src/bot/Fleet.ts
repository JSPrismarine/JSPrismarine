import { Logger } from '@jsprismarine/logger';
import Bot from './Bot';
import type { FleetReport } from './Metrics';
import { Samples } from './Metrics';
import Random from './Random';
import { createBehaviors } from './behavior/Behaviors';

export interface FleetOptions {
    readonly host: string;
    readonly port?: number;
    /** Which transport every bot dials; RakNet by default. */
    readonly network?: 'raknet' | 'nethernet';
    readonly count: number;
    /** Behavior names, e.g. `['walk', 'chat']`. */
    readonly behaviors?: readonly string[];
    /**
     * How many bots to connect per second.
     *
     * Not a politeness setting: connecting hundreds at once measures how a server copes with
     * a thundering herd, which is a different question from how it copes with hundreds of
     * players. Ramping lets you ask the second one.
     */
    readonly ramp?: number;
    readonly seed?: number;
    readonly viewDistance?: number;
    /** Base name; each bot gets its index appended. */
    readonly namePrefix?: string;
    readonly logger?: Logger;
    readonly loginTimeoutMs?: number;
}

const DEFAULT_RAMP_PER_SECOND = 10;

/**
 * A fleet of synthetic players, and the numbers they produce.
 *
 * The unit of a load test is the fleet rather than the bot: what is being measured is a
 * server's behavior under N connections, and every number worth having - login latency
 * percentiles, throughput, how many made it - is a property of the population.
 *
 * Everything random is derived from one seed, so two runs against the same server differ
 * because the server did, not because the bots chose differently.
 *
 * @example
 * ```typescript
 * const fleet = new Fleet({ host: '127.0.0.1', count: 50, behaviors: ['walk', 'chat'], seed: 1234 });
 * await fleet.connect();
 * await fleet.run(60_000);
 * console.log(formatReport(fleet.report()));
 * ```
 */
export default class Fleet {
    private readonly bots: Bot[] = [];
    private readonly logger: Logger;
    private readonly seed: number;
    private readonly loginLatency = new Samples();
    private readonly failures: Map<string, number> = new Map();

    private startedAt = 0;
    private finishedAt = 0;
    private stopped = false;
    /** Ends each wait still pending: a ramp delay, or the run's duration. */
    private readonly pendingWaits: Set<() => void> = new Set();

    public constructor(private readonly options: FleetOptions) {
        this.logger = options.logger ?? new Logger('error');
        this.seed = options.seed ?? 1;

        const behaviorNames = options.behaviors ?? [];
        const prefix = options.namePrefix ?? 'Bot';

        for (let index = 0; index < options.count; index++) {
            this.bots.push(
                new Bot({
                    host: options.host,
                    port: options.port ?? 19132,
                    network: options.network,
                    displayName: `${prefix}${index}`,
                    // Built per bot rather than shared: a behavior holds state - which way
                    // it is walking, when it next speaks - and one instance across five
                    // hundred bots would have them move as one.
                    behaviors: createBehaviors(behaviorNames),
                    random: Random.forMember(this.seed, index),
                    logger: this.logger,
                    viewDistance: options.viewDistance ?? 4,
                    loginTimeoutMs: options.loginTimeoutMs
                })
            );
        }
    }

    public getBots(): readonly Bot[] {
        return this.bots;
    }

    public getConnectedBots(): Bot[] {
        return this.bots.filter((bot) => bot.isConnected());
    }

    /**
     * Connects every bot, at the configured rate, and starts them ticking.
     *
     * A bot that fails to connect is recorded and left out rather than aborting the run:
     * "how many of five hundred got in" is usually the answer being looked for, and a fleet
     * that gives up on the first refusal cannot report it.
     */
    public async connect(): Promise<void> {
        this.startedAt = performance.now();

        const perSecond = this.options.ramp ?? DEFAULT_RAMP_PER_SECOND;
        const spacingMs = perSecond > 0 ? 1000 / perSecond : 0;

        const attempts = this.bots.map(async (bot, index) => {
            if (spacingMs > 0) await this.wait(index * spacingMs);
            if (this.stopped) return;

            try {
                await bot.connect();
                if (bot.loginLatencyMs !== null) this.loginLatency.add(bot.loginLatencyMs);
                bot.start();
            } catch (error: unknown) {
                const reason = error instanceof Error ? error.message : String(error);
                this.failures.set(reason, (this.failures.get(reason) ?? 0) + 1);
            } finally {
                // A bot still dialing when the fleet stopped had nothing to disconnect yet.
                if (this.stopped) bot.disconnect();
            }
        });

        await Promise.all(attempts);
    }

    /**
     * Lets the fleet run for a while, then stops it. {@link Fleet.stop} ends the run early, and
     * a run on a stopped fleet returns at once.
     */
    public async run(durationMs: number): Promise<void> {
        await this.wait(durationMs);
        this.stop();
    }

    /**
     * Disconnects every bot, ends a pending {@link Fleet.run} and leaves bots that have not
     * started connecting unconnected. Only the first call sets the end of the run.
     */
    public stop(): void {
        if (!this.stopped) {
            this.stopped = true;
            this.finishedAt = performance.now();
        }

        for (const finish of this.pendingWaits) finish();
        for (const bot of this.bots) bot.disconnect();
    }

    /** Resolves after `ms`, or as soon as the fleet stops, and clears its timer either way. */
    private wait(ms: number): Promise<void> {
        if (this.stopped) return Promise.resolve();

        return new Promise((resolve) => {
            const finish = () => {
                clearTimeout(timer);
                this.pendingWaits.delete(finish);
                resolve();
            };
            const timer = setTimeout(finish, ms);
            this.pendingWaits.add(finish);
        });
    }

    public report(): FleetReport {
        const finishedAt = this.stopped ? this.finishedAt : performance.now();

        const rtt = new Samples();
        const traffic = { bytesSent: 0, bytesReceived: 0, packetsSent: 0, packetsReceived: 0 };
        const actions: Record<string, number> = {};

        for (const bot of this.bots) {
            const stats = bot.getClient().getStats();
            if (stats.rtt !== null) rtt.add(stats.rtt);

            traffic.bytesSent += stats.bytesSent;
            traffic.bytesReceived += stats.bytesReceived;
            traffic.packetsSent += stats.packetsSent;
            traffic.packetsReceived += stats.packetsReceived;

            for (const [action, count] of bot.actions) {
                actions[action] = (actions[action] ?? 0) + count;
            }
        }

        const connected = this.bots.filter((bot) => bot.loginLatencyMs !== null).length;

        return {
            durationMs: finishedAt - this.startedAt,
            seed: this.seed,
            requested: this.bots.length,
            connected,
            failed: this.bots.length - connected,
            failures: Array.from(this.failures, ([reason, count]) => ({ reason, count })).sort(
                (a, b) => b.count - a.count
            ),
            loginLatencyMs: this.loginLatency.summary(),
            rttMs: rtt.summary(),
            traffic,
            actions,
            // This process, which is the harness. The server's own footprint is the server's
            // to report - a number from here would be measuring the wrong program.
            rssBytes: process.memoryUsage().rss
        };
    }
}
