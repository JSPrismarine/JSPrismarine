import { Logger } from '@jsprismarine/logger';
import Bot from './Bot';
import { Samples, type FleetReport } from './Metrics';
import Random from './Random';
import { createBehaviours } from './behaviour/Behaviours';

export interface FleetOptions {
    readonly host: string;
    readonly port?: number;
    readonly count: number;
    /** Behaviour names, e.g. `['walk', 'chat']`. */
    readonly behaviours?: readonly string[];
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
 * server's behaviour under N connections, and every number worth having - login latency
 * percentiles, throughput, how many made it - is a property of the population.
 *
 * Everything random is derived from one seed, so two runs against the same server differ
 * because the server did, not because the bots chose differently.
 *
 * @example
 * ```typescript
 * const fleet = new Fleet({ host: '127.0.0.1', count: 50, behaviours: ['walk', 'chat'], seed: 1234 });
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

    public constructor(private readonly options: FleetOptions) {
        this.logger = options.logger ?? new Logger('error');
        this.seed = options.seed ?? 1;

        const behaviourNames = options.behaviours ?? [];
        const prefix = options.namePrefix ?? 'Bot';

        for (let index = 0; index < options.count; index++) {
            this.bots.push(
                new Bot({
                    host: options.host,
                    port: options.port ?? 19132,
                    displayName: `${prefix}${index}`,
                    // Built per bot rather than shared: a behaviour holds state - which way
                    // it is walking, when it next speaks - and one instance across five
                    // hundred bots would have them move as one.
                    behaviours: createBehaviours(behaviourNames),
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
            if (spacingMs > 0) await new Promise((resolve) => setTimeout(resolve, index * spacingMs));

            try {
                await bot.connect();
                if (bot.loginLatencyMs !== null) this.loginLatency.add(bot.loginLatencyMs);
                bot.start();
            } catch (error: unknown) {
                const reason = error instanceof Error ? error.message : String(error);
                this.failures.set(reason, (this.failures.get(reason) ?? 0) + 1);
            }
        });

        await Promise.all(attempts);
    }

    /** Lets the fleet run for a while, then stops it. */
    public async run(durationMs: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, durationMs));
        this.stop();
    }

    public stop(): void {
        this.finishedAt = performance.now();
        for (const bot of this.bots) bot.disconnect();
    }

    public report(): FleetReport {
        const finishedAt = this.finishedAt === 0 ? performance.now() : this.finishedAt;

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
