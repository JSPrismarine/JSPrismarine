import type { Module } from '@jsprismarine/kernel';

import { TickEvent } from '../events/Events';
import { profileSpanStarter } from '../profiling/ServerProfiler';
import { TickRecorder } from '../profiling/TickRecorder';
import type { ChunkCompletionQueue } from '../world/ChunkCompletionQueue';
import { DEFAULT_CHUNK_COMPLETION_BUDGET_MS } from '../world/ChunkCompletionQueue';
import { runInTick } from '../world/TickContext';
import { tickerToken } from './tokens';

type LateTickProfile = {
    elapsedMs: number;
    tickHandlersMs: number;
    worldUpdatesMs: number;
    chunkCompletionsMs: number;
    chunkSchedulerMs: number;
    timerDelayMs: number;
    slowestWorldName: string | null;
    slowestWorldMs: number;
};

/** How long each phase of one tick took, for the recorder and the lag profile. */
interface TickPhases {
    readonly tickHandlersMs: number;
    readonly worldUpdatesMs: number;
    readonly chunkCompletionsMs: number;
    readonly chunkSchedulerMs: number;
    readonly slowestWorldName: string | null;
    readonly slowestWorldMs: number;
}

/** The phases of a tick that recorded nothing, as when its work threw before any phase ended. */
const EMPTY_PHASES: TickPhases = {
    tickHandlersMs: 0,
    worldUpdatesMs: 0,
    chunkCompletionsMs: 0,
    chunkSchedulerMs: 0,
    slowestWorldName: null,
    slowestWorldMs: 0
};

/** Refreshes the process title often enough to show recent tick health without writing every second. */
const PROCESS_TITLE_UPDATE_INTERVAL_SECONDS = 5;

/** The tick rate a server runs at until `/tick rate` changes it. */
export const DEFAULT_TICK_RATE = 20;

const MINECRAFT_TICK_TIME_MS = 1000 / DEFAULT_TICK_RATE;

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
            chunkCompletionsMs: summary.chunkCompletionsMs + profile.chunkCompletionsMs,
            chunkSchedulerMs: summary.chunkSchedulerMs + profile.chunkSchedulerMs,
            timerDelayMs: summary.timerDelayMs + profile.timerDelayMs,
            otherMs:
                summary.otherMs +
                Math.max(
                    0,
                    profile.elapsedMs -
                        profile.tickHandlersMs -
                        profile.worldUpdatesMs -
                        profile.chunkCompletionsMs -
                        profile.chunkSchedulerMs
                )
        }),
        {
            elapsedMs: 0,
            tickHandlersMs: 0,
            worldUpdatesMs: 0,
            chunkCompletionsMs: 0,
            chunkSchedulerMs: 0,
            timerDelayMs: 0,
            otherMs: 0
        }
    );
    const average = (duration: number) => `${(duration / profiles.length).toFixed(0)} ms`;
    const slowestWorld = profiles.reduce<LateTickProfile | undefined>(
        (slowest, profile) => (!slowest || profile.slowestWorldMs > slowest.slowestWorldMs ? profile : slowest),
        undefined
    );
    const slowestWorldDetail = slowestWorld?.slowestWorldName
        ? `; slowest world update ${slowestWorld.slowestWorldName} (${slowestWorld.slowestWorldMs.toFixed(0)} ms)`
        : '';

    return `Lag profile over ${profiles.length} late tick(s): avg work ${average(totals.elapsedMs)}/tick (tick handlers ${average(totals.tickHandlersMs)}, world updates ${average(totals.worldUpdatesMs)}, chunk completions ${average(totals.chunkCompletionsMs)}, chunk scheduler ${average(totals.chunkSchedulerMs)}, other ${average(totals.otherMs)}); timer callback delays ${totals.timerDelayMs.toFixed(0)} ms total${slowestWorldDetail}`;
};

/** One world as the tick loop sees it: a name for the lag profile, and an update that runs to its end. */
export interface TickerWorld {
    getName(): string;
    update(tick: number): unknown;
    /** Opens the world's change log tick before the input step, so the inputs land in it. */
    beginChangeTick?(): void;
    /** Seals the world's change log tick when the world did not update, such as a frozen one. */
    sealChangeTick?(): unknown;
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
    /** Calls every handler of the typed server `tick` event inside the tick, waiting for none. */
    emitTick(event: TickEvent): void;
    /**
     * The input step: applies the inputs held since the last tick, in arrival order, up to a
     * count, then the chunk completions it admits. The ticker runs it before anything else in
     * the tick, and before any world updates.
     */
    admitInputs(): number;
    /** Delivers pending network records at this tick's fixed game-thread boundary. */
    pollNetwork(): number;
    /** The worlds to update this tick, in the order the ticker updates them, one after another. */
    getWorlds(): TickerWorld[];
    /** Runs `#minecraft:tick` and whatever `/schedule` put on this tick, as the input step's last input. */
    tickFunctions(): unknown;
    /** The server-wide chunk scheduler the tick hands a time slice to. */
    getChunkScheduler(): {
        setBudget(budgetMs: number): void;
        /** Starts the deliveries that fit in this tick's slice; the tick does not wait for them. */
        tick(): unknown;
    };
    /** Deferred worker translations and background lighting, budgeted separately from packet sends. */
    getChunkCompletionQueue(): Pick<ChunkCompletionQueue, 'activate' | 'deactivate' | 'drain'>;
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
 * the loop emits in every tick, after the input step.
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

/** What `/tick` can do to the loop: the rate it aims for, whether the world advances, and bursts of ticks. */
export interface TickControl {
    /** The ticks per second the loop aims for. */
    getTickRate(): number;
    /** Sets the target ticks per second; a loop that is sprinting keeps sprinting. */
    setTickRate(rate: number): void;
    /** Whether the world and functions are held still. Tick events and chunk sends carry on. */
    isFrozen(): boolean;
    setFrozen(frozen: boolean): void;
    /**
     * Runs `ticks` ticks of a frozen world, then freezes it again.
     *
     * @returns False when the world is not frozen, so there is nothing to step.
     */
    step(ticks: number): boolean;
    /** Ends a step early. @returns False when no step was running. */
    stopStep(): boolean;
    /** Runs `ticks` ticks back to back, then returns to the target rate. */
    sprint(ticks: number): void;
    /** Ends a sprint early. @returns False when no sprint was running. */
    stopSprint(): boolean;
}

/**
 * The fixed-epoch tick loop. `start()` begins ticking immediately (unless the
 * server runs with ticking disabled) and `stop()` clears the pending timer; the
 * counters survive a stop, so a restart resumes the tick number while the
 * schedule restarts from a fresh epoch instead of repaying the downtime as a
 * catch-up burst.
 */
export class ServerTicker implements Ticker, TickControl {
    private readonly server: TickerServer;
    private cancelPendingTick: (() => void) | undefined;
    private running = false;
    /** Set while {@link ServerTicker.advance} runs a tick, so two manual ticks never interleave. */
    private advancing = false;
    private tps = 20;
    private tickMs = 0;
    private currentTick = 0n;
    private tickRate = DEFAULT_TICK_RATE;
    private frozen = false;
    private stepsLeft = 0;
    private sprintLeft = 0;
    /** Set when the period changes, so the next deadline counts from the moment it did. */
    private rebaseSchedule = false;
    /** While set, `start()` waits for {@link ServerTicker.release}; see {@link ServerTicker.hold}. */
    private held = false;

    /** The most recent ticks' duration, lateness and phases, for profiles and benchmarks. */
    public readonly recorder = new TickRecorder();

    /** The clock the loop's schedule and the phase timings read; nothing in a tick's simulation reads it. */
    private readonly now: () => number;

    /**
     * @param server - What the loop drives.
     * @param now - A monotonic clock in milliseconds. Monotonic, not wall clock: `Date.now()`
     *   follows the system time, and an NTP correction or a VM resume moves it under the
     *   scheduler. A forward step used to read as accumulated lateness and trigger a catch-up
     *   burst; a backward one as time to kill, stalling the server for the size of the step.
     */
    public constructor(server: TickerServer, now: () => number = () => performance.now()) {
        this.server = server;
        this.now = now;
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

    /** The ticks per second the loop aims for. */
    public getTickRate(): number {
        return this.tickRate;
    }

    /** Sets the target ticks per second; the schedule restarts from now at the new period. */
    public setTickRate(rate: number): void {
        this.tickRate = rate;
        this.rebaseSchedule = true;
    }

    /** Whether the world and functions are held still. */
    public isFrozen(): boolean {
        return this.frozen;
    }

    /** Freezes or unfreezes the world, dropping any step in progress. */
    public setFrozen(frozen: boolean): void {
        this.frozen = frozen;
        this.stepsLeft = 0;
    }

    /** Lets `ticks` ticks through a frozen world; false when the world is running. */
    public step(ticks: number): boolean {
        if (!this.frozen) return false;
        this.stepsLeft = ticks;
        return true;
    }

    /** Ends a step early; false when none was running. */
    public stopStep(): boolean {
        const stepping = this.stepsLeft > 0;
        this.stepsLeft = 0;
        return stepping;
    }

    /** Runs `ticks` ticks back to back, then returns to the target rate. */
    public sprint(ticks: number): void {
        this.sprintLeft = ticks;
    }

    /** Ends a sprint early; false when none was running. */
    public stopSprint(): boolean {
        const sprinting = this.sprintLeft > 0;
        this.sprintLeft = 0;
        this.rebaseSchedule = true;
        return sprinting;
    }

    /**
     * Keeps the loop from starting until {@link ServerTicker.release}. The server holds it while
     * it starts, so no tick runs before every transport listens.
     */
    public hold(): void {
        this.held = true;
    }

    /** Lets the loop start, and starts it if a `start()` was held back. */
    public release(): void {
        if (!this.held) return;
        this.held = false;
        if (this.startRequested) this.start();
    }

    /** Whether a `start()` came while the loop was held. */
    private startRequested = false;

    /** Starts the loop; a no-op when ticking is disabled or the loop already runs. */
    public start(): void {
        if (this.held) {
            this.startRequested = true;
            return;
        }
        this.startRequested = false;
        if (this.running || !this.server.isTickingEnabled()) return;
        this.running = true;
        this.server.getChunkCompletionQueue().activate();

        const server = this.server;
        const logger = server.getLogger();
        const { now } = this;

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
        let epochTick = this.currentTick;
        let nextTickExpectedStartAt = epoch;

        // Completion times of the ticks within the last second, oldest first.
        const recentTicks: number[] = [];
        const lateTickProfiles: LateTickProfile[] = [];
        const maxProfileCount = Math.ceil(MAX_CATCH_UP_MS / MINECRAFT_TICK_TIME_MS);
        const tick = () => {
            if (server.isStopping() || !this.running) return;
            const tickStartedAt = now();
            const dueAt = epoch + (Number(this.currentTick - epochTick) * 1000) / this.tickRate;
            const timerDelayMs = Math.max(0, tickStartedAt - nextTickExpectedStartAt);
            let phases = EMPTY_PHASES;
            try {
                phases = this.runTick();
            } finally {
                const {
                    tickHandlersMs,
                    worldUpdatesMs,
                    chunkCompletionsMs,
                    chunkSchedulerMs,
                    slowestWorldName,
                    slowestWorldMs
                } = phases;
                const endTime = now();
                const elapsedMs = endTime - tickStartedAt;
                this.recorder.record({
                    tick: Number(this.currentTick),
                    latenessMs: Math.max(0, tickStartedAt - dueAt),
                    elapsedMs,
                    tickHandlersMs,
                    worldUpdatesMs,
                    chunkCompletionsMs,
                    chunkSchedulerMs
                });
                this.currentTick++;

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
                if (this.rebaseSchedule) {
                    this.rebaseSchedule = false;
                    epoch = endTime;
                    epochTick = this.currentTick;
                }
                let sleepTime = epoch + (Number(this.currentTick - epochTick) * 1000) / this.tickRate - endTime;
                if (this.sprintLeft > 0) {
                    // Back to back: no sleeping, and no debt carried out of the burst.
                    this.sprintLeft--;
                    if (this.sprintLeft === 0) this.rebaseSchedule = true;
                    epoch = endTime;
                    epochTick = this.currentTick;
                    sleepTime = 0;
                }
                if (sleepTime <= 0) {
                    lateTickProfiles.push({
                        elapsedMs,
                        tickHandlersMs,
                        worldUpdatesMs,
                        chunkCompletionsMs,
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
                        `Can't keep up! Skipping ${(behindBy / (1000 / this.tickRate)).toFixed(0)} ticks (${behindBy.toFixed(0)} ms behind)`,
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
                    if (sleepTime <= 0) {
                        // Node clamps an overdue zero-delay timeout to roughly 1 ms. An
                        // immediate keeps catch-up ticks back-to-back while still yielding
                        // through the event loop so sockets and other I/O get a turn.
                        //
                        // Not unref'd, unlike the timeout below. An unref'd immediate does not
                        // keep the loop from waiting in its poll phase, so the next tick ran
                        // when something else woke the loop: with the UDP socket on a worker
                        // thread that was a timer about 20 ms away, and a sprint of back-to-back
                        // ticks crawled at 2 a second behind it. It never outlives a tick, and
                        // `stop` clears it.
                        const immediate = setImmediate(tick);
                        this.cancelPendingTick = () => clearImmediate(immediate);
                    } else {
                        const timeout = setTimeout(tick, sleepTime);
                        timeout.unref();
                        this.cancelPendingTick = () => clearTimeout(timeout);
                    }
                }
            }
        };

        // Start ticking
        tick();
    }

    /**
     * Runs one tick by hand, outside the loop's schedule, to its end in one call.
     *
     * For a harness that drives a server with ticking disabled, such as a replay: each call is
     * exactly one tick, whatever the host's speed, so two runs of the same input take the same
     * steps. It runs the same work, in the same order, as a tick of the loop.
     *
     * @throws {Error} While the loop runs, or when called from inside the tick it is running.
     */
    public advance(): void {
        if (this.running) throw new Error('Cannot advance the ticker by hand while its loop runs');
        if (this.advancing) throw new Error('Cannot advance the ticker while a manual tick is in flight');
        if (this.server.isStopping()) return;

        this.advancing = true;
        const startedAt = this.now();
        try {
            const { tickHandlersMs, worldUpdatesMs, chunkCompletionsMs, chunkSchedulerMs } = this.runTick();
            this.recorder.record({
                tick: Number(this.currentTick),
                latenessMs: 0,
                elapsedMs: this.now() - startedAt,
                tickHandlersMs,
                worldUpdatesMs,
                chunkCompletionsMs,
                chunkSchedulerMs
            });
        } finally {
            this.currentTick++;
            this.advancing = false;
        }
    }

    /**
     * One tick's work: the input step with the functions last in it, the tick event and the
     * worlds, which are the simulation, then the chunk preparations, the chunk sends and the
     * network poll, in that order. Shared by the loop and
     * {@link advance}.
     *
     * Synchronous: no phase awaits, so the tick ends when this returns, and nothing it started
     * and did not wait for, such as a send or a chunk load, runs before then.
     *
     * @returns How long each phase took, for the recorder and the lag profile.
     */
    private runTick(): TickPhases {
        const server = this.server;
        const logger = server.getLogger();
        const startProfile = profileSpanStarter(server.getProfileOwner());
        const { now } = this;
        let tickHandlersMs = 0;
        let worldUpdatesMs = 0;
        let chunkCompletionsMs = 0;
        let chunkSchedulerMs = 0;
        let slowestWorldName: string | null = null;
        let slowestWorldMs = 0;
        let phaseStartedAt = 0;
        const endTickProfile = startProfile?.('Server.tick');

        // The next tick is scheduled from `finally`, and everything that can throw is
        // inside the `try`, because the timer for the next tick is installed only
        // once this one has finished. Anything escaping - a chunk that will not
        // generate, a world update, a plugin's tick listener - used to leave no timer
        // behind, and the server then sat there accepting connections while time
        // stood still. A tick that fails is worth a log line; it is not worth the
        // server.
        try {
            // The simulation phases run inside the tick's scope, which code they call reads to know
            // it runs inside the tick (ADR 0015). Chunk delivery is outside.
            runInTick(() => {
                // The input step comes first (ADR 0015): the input-lane packets and player removals
                // held since the last tick, applied in arrival order before any world updates, then
                // the chunk completions the step admits, so no chunk enters or leaves in the middle
                // of a world's tick. The levels tick one after another, so this one step is the input step of every
                // world; when they tick apart, each world drains the inputs of its own players.
                // Every world's change log tick opens first, so what the step applies is logged
                // in the tick that applied it, and each world seals its tick when it closes.
                const ticked = server.getWorlds();
                for (const world of ticked) world.beginChangeTick?.();
                const endInputsProfile = startProfile?.('Server.inputs');
                try {
                    server.admitInputs();
                } finally {
                    endInputsProfile?.();
                }

                // A frozen world holds still, but a step lets some ticks through.
                const advancing = !this.frozen || this.stepsLeft > 0;
                if (this.frozen && this.stepsLeft > 0) this.stepsLeft--;

                // `#minecraft:tick` and whatever `/schedule` put on this tick, as the last input of
                // the step, before the worlds, as Java's `tickChildren` runs its functions before
                // its levels. A function sees the inputs of this step applied.
                const endFunctionsProfile = startProfile?.('Server.tickFunctions');
                try {
                    if (advancing) server.tickFunctions();
                } finally {
                    endFunctionsProfile?.();
                }
                const event = new TickEvent(this.getTick());

                // Each tick handler is called inside this tick and runs to its first wait; what an
                // asynchronous one does after that lands outside the tick, and the server reports
                // its rejection.
                phaseStartedAt = now();
                const endTickHandlersProfile = startProfile?.('Server.tickHandlers');
                try {
                    server.emitTick(event);
                } finally {
                    tickHandlersMs = now() - phaseStartedAt;
                    endTickHandlersProfile?.();
                }

                // One world after another, in the order `getWorlds` gives, each to its end before the
                // next. A world that throws is logged and costs only its own tick.
                phaseStartedAt = now();
                try {
                    for (const world of advancing ? server.getWorlds() : []) {
                        const worldStartedAt = now();
                        const endWorldProfile = startProfile?.(`World.update:${world.getName()}`);
                        try {
                            world.update(event.getTick());
                        } catch (error: unknown) {
                            logger.error(`World ${world.getName()} failed tick ${event.getTick()}`);
                            logger.error(error);
                        } finally {
                            endWorldProfile?.();
                            const elapsedMs = now() - worldStartedAt;
                            if (elapsedMs > slowestWorldMs) {
                                slowestWorldMs = elapsedMs;
                                slowestWorldName = world.getName();
                            }
                        }
                    }
                } finally {
                    worldUpdatesMs = now() - phaseStartedAt;
                }

                // A world opened above and not updated, because the server is frozen or the world
                // list changed, closes its tick here.
                for (const world of ticked) world.sealChangeTick?.();
            });

            // The preparation of chunks, such as translating a worker's result, up to a slice of
            // wall time. Outside the simulation: what it prepares waits for the next input step,
            // which admits by count, so the clock decides only how soon a chunk is ready.
            const endCompletionProfile = startProfile?.('Server.chunkCompletions');
            phaseStartedAt = now();
            try {
                server.getChunkCompletionQueue().drain(DEFAULT_CHUNK_COMPLETION_BUDGET_MS);
            } finally {
                chunkCompletionsMs = now() - phaseStartedAt;
                endCompletionProfile?.();
            }

            // Whatever fits in this tick's slice; the rest waits for the next one. The deliveries
            // it starts run outside the tick and are not waited for.
            phaseStartedAt = now();
            const endChunkSchedulerProfile = startProfile?.('Server.chunkScheduler');
            try {
                const chunkScheduler = server.getChunkScheduler();
                chunkScheduler.setBudget(server.getChunkSendBudgetMs());
                chunkScheduler.tick();
            } finally {
                chunkSchedulerMs = now() - phaseStartedAt;
                endChunkSchedulerProfile?.();
            }

            const ticksPerSecond = 1000 / MINECRAFT_TICK_TIME_MS;
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
            // Worker networking owns UDP and reliability timers and hands its records to the game
            // thread here, at the end of the tick, so what the worker received during this tick
            // reaches the next input step, as a frame the socket transport delivers mid-tick
            // does. Polled at the start, it would have waited a tick longer than that frame.
            try {
                server.pollNetwork();
            } catch (error: unknown) {
                logger.error(error);
            }
            endTickProfile?.();
        }

        return {
            tickHandlersMs,
            worldUpdatesMs,
            chunkCompletionsMs,
            chunkSchedulerMs,
            slowestWorldName,
            slowestWorldMs
        };
    }

    /** Stops the loop: clears the pending timer and stops a tick in flight from rescheduling. */
    public stop(): void {
        this.startRequested = false;
        this.running = false;
        this.cancelPendingTick?.();
        this.cancelPendingTick = undefined;
        this.server.getChunkCompletionQueue().deactivate();
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
