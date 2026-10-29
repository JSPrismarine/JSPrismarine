import type { Module } from '@jsprismarine/kernel';

import { TickEvent } from '../events/Events';
import { startProfileSpan } from '../profiling/ServerProfiler';
import { tickerToken } from './tokens';

type LateTickProfile = {
    elapsedMs: number;
    tickHandlersMs: number;
    worldUpdatesMs: number;
    chunkSchedulerMs: number;
    timerDelayMs: number;
    slowestWorldName: string | null;
    slowestWorldMs: number;
};

/** Refreshes the process title often enough to show recent tick health without writing every second. */
const PROCESS_TITLE_UPDATE_INTERVAL_SECONDS = 5;

const MINECRAFT_TICK_TIME_MS = 1000 / 20;

/**
 * How far behind schedule the loop may fall before it stops trying to make the time
 * back. Below this, missed ticks are run back to back until the clock is caught: a
 * hitch of a few ticks should not leave the world permanently running late. Above it,
 * the backlog is written off - a ten second stall would otherwise be repaid as two
 * hundred consecutive ticks, running the world at maximum speed and starving the
 * event loop exactly when it is already struggling.
 */
const MAX_CATCH_UP_MS = 2000;

/** Weight of the newest tick in the tick-duration average: the last ten or so ticks carry most of it. */
const TICK_MS_SMOOTHING = 0.2;

const summarizeLateTicks = (profiles: readonly LateTickProfile[]): string => {
    const totals = profiles.reduce(
        (summary, profile) => ({
            elapsedMs: summary.elapsedMs + profile.elapsedMs,
            tickHandlersMs: summary.tickHandlersMs + profile.tickHandlersMs,
            worldUpdatesMs: summary.worldUpdatesMs + profile.worldUpdatesMs,
            chunkSchedulerMs: summary.chunkSchedulerMs + profile.chunkSchedulerMs,
            timerDelayMs: summary.timerDelayMs + profile.timerDelayMs,
            otherMs:
                summary.otherMs +
                Math.max(
                    0,
                    profile.elapsedMs - profile.tickHandlersMs - profile.worldUpdatesMs - profile.chunkSchedulerMs
                )
        }),
        { elapsedMs: 0, tickHandlersMs: 0, worldUpdatesMs: 0, chunkSchedulerMs: 0, timerDelayMs: 0, otherMs: 0 }
    );
    const average = (duration: number) => `${(duration / profiles.length).toFixed(0)} ms`;
    const slowestWorld = profiles.reduce<LateTickProfile | undefined>(
        (slowest, profile) => (!slowest || profile.slowestWorldMs > slowest.slowestWorldMs ? profile : slowest),
        undefined
    );
    const slowestWorldDetail = slowestWorld?.slowestWorldName
        ? `; slowest world update ${slowestWorld.slowestWorldName} (${slowestWorld.slowestWorldMs.toFixed(0)} ms)`
        : '';

    return `Lag profile over ${profiles.length} late tick(s): avg work ${average(totals.elapsedMs)}/tick (tick handlers ${average(totals.tickHandlersMs)}, world updates ${average(totals.worldUpdatesMs)}, chunk scheduler ${average(totals.chunkSchedulerMs)}, other ${average(totals.otherMs)}); timer callback delays ${totals.timerDelayMs.toFixed(0)} ms total${slowestWorldDetail}`;
};

/** One world as the tick loop sees it: a name for the lag profile, and an update to await. */
export interface TickerWorld {
    getName(): string;
    update(tick: number): Promise<unknown>;
}

/**
 * The slice of the server the tick loop drives. Everything here is a collaborator
 * that is not a kernel module yet; as each one converts, its accessor should be
 * replaced by a service token the ticker module declares as a dependency:
 *
 * - `getWorlds` belongs to a future worlds token (the world manager).
 * - `tickFunctions` belongs to a future commands token (the command manager).
 * - `getChunkScheduler` belongs to a future chunk-scheduler token.
 * - `getChunkSendBudgetMs`, `isTickingEnabled`, and `isProcessTitleEnabled`
 *   belong to a future config token (or the ticker module's config slice).
 * - `emitTick` belongs to the kernel event bus once the typed server `tick`
 *   event moves there.
 */
export interface TickerServer {
    /** Emits the typed server `tick` event and awaits every handler, inside the tick. */
    emitTick(event: TickEvent): Promise<void>;
    /** The worlds to update this tick, in parallel. */
    getWorlds(): TickerWorld[];
    /** Runs `#minecraft:tick` and whatever `/schedule` put on this tick. */
    tickFunctions(): Promise<unknown>;
    /** The server-wide chunk scheduler the tick hands a time slice to. */
    getChunkScheduler(): {
        setBudget(budgetMs: number): void;
        tick(): Promise<unknown>;
    };
    /** This tick's chunk-send budget, read fresh each tick so config reloads apply. */
    getChunkSendBudgetMs(): number;
    /** Whether the loop should run at all. Read once per `start()`. */
    isTickingEnabled(): boolean;
    /** Whether to write TPS and tick into the process title. */
    isProcessTitleEnabled(): boolean;
    /** Headless servers do not own the terminal, so they leave the title alone. */
    isHeadless(): boolean;
    /** Whether a server shutdown has begun; a tick in flight then stops rescheduling. */
    isStopping(): boolean;
    /** The object the opt-in profiler was attached to (the server). */
    getProfileOwner(): object;
    /** Where the catch-up skip warns and the lag profile prints. */
    getLogger(): {
        warn(message: string, scope?: string): void;
        verbose(message: string, scope?: string): void;
        error(error: unknown): void;
    };
}

/**
 * What the `prismarine:ticker` token resolves to: the running tick counters.
 * Tick work itself is observed through the server's typed `tick` event, which
 * the loop emits and awaits at the top of every tick.
 */
export interface Ticker {
    /** The current tick number. */
    getTick(): number;
    /** The current TPS, measured over a sliding one-second window. */
    getTPS(): number;
    /**
     * How long a tick's work has been taking, in milliseconds, as a moving average
     * over the most recent ticks. It leaves out the sleep between ticks, so a healthy
     * server reads well under the 50 ms period. Zero until the first tick completes.
     */
    getTickMs(): number;
}

/**
 * The fixed-epoch tick loop. `start()` begins ticking immediately (unless the
 * server runs with ticking disabled) and `stop()` clears the pending timer; the
 * counters survive a stop, so a restart resumes the tick number while the
 * schedule restarts from a fresh epoch instead of repaying the downtime as a
 * catch-up burst.
 */
export class ServerTicker implements Ticker {
    private readonly server: TickerServer;
    private tickerTimer: NodeJS.Timeout | undefined;
    private running = false;
    private tps = 20;
    private tickMs = 0;
    private currentTick = 0n;

    public constructor(server: TickerServer) {
        this.server = server;
    }

    /** The current tick number. */
    public getTick(): number {
        return Number(this.currentTick);
    }

    /** The current TPS, measured over a sliding one-second window. */
    public getTPS(): number {
        return Number.parseFloat(this.tps.toFixed(2));
    }

    /** The smoothed per-tick work duration in milliseconds; see {@link Ticker.getTickMs}. */
    public getTickMs(): number {
        return Number.parseFloat(this.tickMs.toFixed(2));
    }

    /** Starts the loop; a no-op when ticking is disabled or the loop already runs. */
    public start(): void {
        if (this.running || !this.server.isTickingEnabled()) return;
        this.running = true;

        const server = this.server;
        const logger = server.getLogger();
        const profileOwner = server.getProfileOwner();

        // Monotonic, not wall clock: `Date.now()` follows the system time, and an NTP
        // correction or a VM resume moves it under the scheduler. A forward step used to
        // read as accumulated lateness and trigger a catch-up burst; a backward one as
        // time to kill, stalling the server for the size of the step.
        const now = () => performance.now();

        // Every tick's deadline is derived from one fixed origin, so a tick that runs
        // long is absorbed rather than shifting every deadline behind it.
        //
        // The previous form corrected the same lateness twice - once against the last
        // period (`MINECRAFT_TICK_TIME_MS - executionTime`, where `executionTime` was
        // measured from the *end* of the previous tick and so already included its
        // sleep) and again against the accumulated total. Two corrections for one error
        // is a loop gain of two, and the loop oscillated accordingly: it alternated a
        // near-zero gap with a near-100ms one, averaging a correct 20 TPS while never
        // actually holding 50ms. Everything leaving the tick in a batch - entity
        // movement, chunk sends - went out in pairs separated by silence.
        let epoch = now();
        const epochTick = this.currentTick;
        let nextTickExpectedStartAt = epoch;

        // Completion times of the ticks within the last second, oldest first.
        const recentTicks: number[] = [];
        const lateTickProfiles: LateTickProfile[] = [];
        const maxProfileCount = Math.ceil(MAX_CATCH_UP_MS / MINECRAFT_TICK_TIME_MS);
        const tick = async () => {
            if (server.isStopping() || !this.running) return;
            const tickStartedAt = now();
            const timerDelayMs = Math.max(0, tickStartedAt - nextTickExpectedStartAt);
            let tickHandlersMs = 0;
            let worldUpdatesMs = 0;
            let chunkSchedulerMs = 0;
            let slowestWorldName: string | null = null;
            let slowestWorldMs = 0;
            const endTickProfile = startProfileSpan(profileOwner, 'Server.tick');

            // The next tick is scheduled from `finally`, and everything that can throw is
            // inside the `try`, because the timer for the next tick is installed only
            // once this one has finished. Anything escaping - a chunk that will not
            // generate, a world update, a plugin's tick listener - used to leave no timer
            // behind, and the server then sat there accepting connections while time
            // stood still. A tick that fails is worth a log line; it is not worth the
            // server.
            try {
                const event = new TickEvent(this.getTick());

                // Awaited, so a plugin's tick handler runs *inside* this tick like every
                // other piece of tick work. Discarding the promise let its continuation
                // land in the middle of some later tick, and its rejection could not
                // reach the catch below - it surfaced as an unhandled rejection instead.
                let phaseStartedAt = now();
                const endTickHandlersProfile = startProfileSpan(profileOwner, 'Server.tickHandlers');
                try {
                    await server.emitTick(event);
                } finally {
                    tickHandlersMs = now() - phaseStartedAt;
                    endTickHandlersProfile();
                }

                const ticksPerSecond = 1000 / MINECRAFT_TICK_TIME_MS;

                // Update all worlds.
                phaseStartedAt = now();
                try {
                    await Promise.all(
                        server.getWorlds().map(async (world) => {
                            const worldStartedAt = now();
                            const endWorldProfile = startProfileSpan(profileOwner, `World.update:${world.getName()}`);
                            try {
                                await world.update(event.getTick());
                            } finally {
                                endWorldProfile();
                                const elapsedMs = now() - worldStartedAt;
                                if (elapsedMs > slowestWorldMs) {
                                    slowestWorldMs = elapsedMs;
                                    slowestWorldName = world.getName();
                                }
                            }
                        })
                    );
                } finally {
                    worldUpdatesMs = now() - phaseStartedAt;
                }

                // `#minecraft:tick` and whatever `/schedule` put on this tick. After the
                // worlds, as Java runs it, so a function sees the world the tick left.
                const endFunctionsProfile = startProfileSpan(profileOwner, 'Server.tickFunctions');
                try {
                    await server.tickFunctions();
                } finally {
                    endFunctionsProfile();
                }

                // Whatever fits in this tick's slice; the rest waits for the next one.
                phaseStartedAt = now();
                const endChunkSchedulerProfile = startProfileSpan(profileOwner, 'Server.chunkScheduler');
                try {
                    const chunkScheduler = server.getChunkScheduler();
                    chunkScheduler.setBudget(server.getChunkSendBudgetMs());
                    await chunkScheduler.tick();
                } finally {
                    chunkSchedulerMs = now() - phaseStartedAt;
                    endChunkSchedulerProfile();
                }

                if (
                    server.isProcessTitleEnabled() &&
                    this.getTick() % (ticksPerSecond * PROCESS_TITLE_UPDATE_INTERVAL_SECONDS) === 0 &&
                    !server.isHeadless()
                ) {
                    // Update the process title with TPS and tick.
                    process.title = `TPS: ${this.getTPS().toFixed(2)} | Tick: ${this.getTick()} | ${process.title.split('| ').at(-1)!}`;
                }
            } catch (error: unknown) {
                logger.error(error);
            } finally {
                endTickProfile();
                this.currentTick++;
                const endTime = now();
                const elapsedMs = endTime - tickStartedAt;

                // TPS over a sliding window of the last second. The window used to be
                // rebased whenever it crossed a second, which left the next reading
                // measured over a single tick - noise, reported as a rate.
                // Never pruned below two, so there is always a pair to measure between.
                // Dropping to one collapses the window to zero width, and the reading
                // then holds its last value - a server slowed past one tick a second
                // would have gone on reporting whatever it managed before, which for a
                // server that had never yet been measured is the optimistic 20 it starts
                // life with.
                recentTicks.push(endTime);
                while (recentTicks.length > 2 && endTime - recentTicks[0]! > 1000) recentTicks.shift();
                const window = endTime - recentTicks[0]!;
                // Deliberately not clamped to 20. A loop making up lost time genuinely
                // runs faster than that, and hiding it behind the target rate meant the
                // one metric that should expose the fault reported perfect health.
                if (window > 0) this.tps = ((recentTicks.length - 1) * 1000) / window;
                // Work per tick, smoothed. TPS alone hides load: the loop holds 20 TPS
                // until a tick overruns its 50 ms, so this is what shows a tick at 40.
                this.tickMs =
                    this.tickMs === 0 ? elapsedMs : this.tickMs + (elapsedMs - this.tickMs) * TICK_MS_SMOOTHING;

                // One correction, against one deadline. Deadlines count from the tick
                // this start resumed at, so a restarted loop is not billed for the
                // ticks that ran before its epoch.
                let sleepTime = epoch + Number(this.currentTick - epochTick) * MINECRAFT_TICK_TIME_MS - endTime;
                if (sleepTime <= 0) {
                    lateTickProfiles.push({
                        elapsedMs,
                        tickHandlersMs,
                        worldUpdatesMs,
                        chunkSchedulerMs,
                        timerDelayMs,
                        slowestWorldName,
                        slowestWorldMs
                    });
                    if (lateTickProfiles.length > maxProfileCount) lateTickProfiles.shift();
                } else {
                    lateTickProfiles.length = 0;
                }

                if (-sleepTime > MAX_CATCH_UP_MS) {
                    // Too far behind to make up. Move the origin forward by the debt so
                    // the schedule resumes from here instead of chasing a deadline that
                    // has already passed for the next forty ticks.
                    const behindBy = -sleepTime;
                    epoch += behindBy;
                    sleepTime = 0;
                    logger.warn(
                        `Can't keep up! Skipping ${(behindBy / MINECRAFT_TICK_TIME_MS).toFixed(0)} ticks (${behindBy.toFixed(0)} ms behind)`,
                        'Server/tick'
                    );
                    logger.verbose(summarizeLateTicks(lateTickProfiles), 'Server/tick');
                }

                // Not while shutting down: `Server.shutdown` stops the ticker, and a tick
                // still in flight at that moment would otherwise install a fresh timer
                // behind it.
                if (!server.isStopping() && this.running) {
                    const delay = Math.max(0, sleepTime);
                    nextTickExpectedStartAt = endTime + delay;
                    this.tickerTimer = setTimeout(tick, delay);
                    this.tickerTimer.unref();
                }
            }
        };

        // Start ticking
        void tick();
    }

    /** Stops the loop: clears the pending timer and stops a tick in flight from rescheduling. */
    public stop(): void {
        this.running = false;
        clearTimeout(this.tickerTimer);
        this.tickerTimer = undefined;
    }
}

/**
 * Runs the {@link ServerTicker} as `prismarine:ticker`, providing it under
 * {@link tickerToken}. The loop starts when the module starts and stops when it
 * stops; the server also stops it directly at the top of a shutdown, before any
 * teardown awaits, so no tick lands in a world mid-teardown.
 *
 * @param ticker - The ticker the server constructed, so its counters are
 * readable before the kernel starts.
 * @returns The module to register on the kernel.
 */
export const tickerModule = (ticker: ServerTicker): Module => ({
    id: 'prismarine:ticker',
    register: (ctx) => {
        ctx.provide(tickerToken, ticker);
    },
    start: () => ticker.start(),
    stop: () => ticker.stop()
});
