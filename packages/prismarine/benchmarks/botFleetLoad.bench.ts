/**
 * Runs a seeded bot fleet against a headless in-process server with fixed-tick join, steady,
 * and crowd phases. The separate bot worker keeps client CPU out of the server process metric.
 *
 * Examples (from the repository root or this package):
 *   pnpm --filter @jsprismarine/prismarine run bench:bot-fleet
 *   pnpm --filter @jsprismarine/prismarine run bench:bot-fleet -- --terrain real
 *   pnpm --filter @jsprismarine/prismarine run bench:bot-fleet:baseline
 *
 * With real terrain the run ends with a preload phase, run twice on the same server: once with the
 * generator asked for nothing and once with a large region requested all at once. The difference
 * between the two arms is the tick cost of generation. The report carries it under `preload`,
 * apart from `phases`, so the baseline comparison never sees it. Flags: `--workers N`,
 * `--preload-radius N`, `--preload-ticks N`, `--preload-urgency idle|soon|immediate`,
 * `--host process|in-process`, `--preload-control` (neither arm asks for chunks, so the
 * difference should read zero), `--preload-with-fleet` (keep the bots connected) and
 * `--no-preload`.
 *
 * The real-terrain variant needs the Java worldgen cache: `pnpm --filter
 * @jsprismarine/bedrock-data run ensure:worldgen` (JDK 25 or newer).
 *
 * The committed baseline is for flat terrain on the pinned macOS M1 runner. After an intentional
 * workload or runner change, inspect two reports with the same workload digest, then update it
 * with `pnpm --filter @jsprismarine/prismarine run bench:bot-fleet -- --update-baseline
 * benchmarks/botFleetLoad.baseline.json`.
 */
import { fork } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setImmediate as yieldToEventLoop } from 'node:timers/promises';
import { Logger } from '@jsprismarine/logger';
import { PerformanceObserver, performance } from 'node:perf_hooks';
import Server from '@jsprismarine/prismarine/Server';
import { Config } from '@jsprismarine/prismarine/config/Config';
import { ServerProfiler, attachProfiler } from '@jsprismarine/prismarine/profiling/ServerProfiler';
import { summarizeTicks } from '@jsprismarine/prismarine/profiling/TickRecorder';
import {
    BOT_FLEET_MAX_REGRESSION_PERCENT,
    chunksPerCpuSecond,
    labelCostPerChunk,
    preloadTickCost,
    subtractLabelStats,
    workerCpuMs,
    type PreloadArm,
    botFleetLoginTimeoutMs,
    botFleetPhases,
    botFleetWorkloadDigest,
    compareBotFleetBaseline,
    type BotFleetBaseline,
    type BotFleetEnvironment,
    type BotFleetLoadReport,
    type BotFleetTerrain
} from './botFleetLoadSupport';

interface FleetWorkerReport {
    readonly connected: number;
    readonly failed: number;
    readonly failures?: readonly { readonly reason: string; readonly count: number }[];
}

interface FleetWorkerMessage {
    readonly type: 'connected' | 'stopped' | 'error' | 'progress';
    readonly report?: FleetWorkerReport;
    readonly message?: string;
    readonly connected?: number;
    readonly requested?: number;
}

interface FleetController {
    readonly connected: Promise<FleetWorkerReport>;
    readonly stopped: Promise<FleetWorkerReport>;
    start(seed: number, count: number, namePrefix: string): void;
    stop(): void;
}

interface PhaseRecord {
    readonly name: string;
    readonly ticks: number;
    readonly cpuUsPerTick: number;
    readonly wallMs: number;
    readonly connectedPlayers: number;
    readonly entities: number;
    readonly loadedChunks: number;
    readonly gc: { readonly count: number; readonly durationMs: number };
    readonly profileSpanShares: Readonly<Record<string, number>>;
    readonly startedAtMs: number;
    readonly endedAtMs: number;
}

class BenchmarkConfig extends Config {
    public constructor(
        private readonly terrain: BotFleetTerrain,
        private readonly playerLimit: number,
        private readonly workers: number | undefined,
        private readonly host: 'process' | 'in-process'
    ) {
        super();
    }

    public override async enable(): Promise<void> {}

    public override getServerIp(): string {
        return '127.0.0.1';
    }

    public override getLevelName(): string {
        return 'bot-fleet-benchmark';
    }

    public override getWorlds() {
        return {
            'bot-fleet-benchmark': {
                seed: '2727',
                provider: 'LevelDB',
                preset: this.terrain === 'flat' ? 'minecraft:flat' : 'minecraft:normal'
            }
        };
    }

    public override getMaxPlayers(): number {
        return this.playerLimit;
    }

    public override getChunkHost(): 'process' | 'in-process' {
        return this.host;
    }

    public override getChunkWorkers(): number {
        return this.workers ?? super.getChunkWorkers();
    }

    public override getViewDistance(): number {
        return 2;
    }

    public override getPreloadRadius(): number {
        return 0;
    }

    public override getChunkSendBudgetMs(): number {
        return 5;
    }

    public override getOnlineMode(): boolean {
        return false;
    }

    public override getEnableQuery(): boolean {
        return false;
    }

    public override getEnableProcessTitle(): boolean {
        return false;
    }

    public override getEnableTicking(): boolean {
        return true;
    }
}

interface PreloadOptions {
    /** Undefined means on for real terrain and off for flat, which has no pool to hold back. */
    enabled: boolean | undefined;
    radius: number;
    ticks: number;
    urgency: 'idle' | 'soon' | 'immediate';
    control: boolean;
    /** Keep the bot fleets connected during the preload. See the header: this can freeze the tick. */
    withFleet: boolean;
}

const parseArguments = (arguments_: readonly string[]) => {
    let terrain: BotFleetTerrain = 'flat';
    let baselinePath: string | undefined;
    let updateBaselinePath: string | undefined;
    const preload: PreloadOptions = {
        enabled: undefined,
        radius: 8,
        ticks: 200,
        urgency: 'idle',
        control: false,
        withFleet: false
    };
    let workers: number | undefined;
    let host: 'process' | 'in-process' = 'in-process';
    for (let index = 0; index < arguments_.length; index++) {
        const argument = arguments_[index];
        if (argument === '--help') {
            process.stdout.write(
                'Usage: bench:bot-fleet [--terrain flat|real] [--baseline file | --update-baseline file]\n' +
                    '  [--workers N] [--no-preload] [--preload-radius N] [--preload-ticks N]\n' +
                    '  [--preload-urgency idle|soon|immediate] [--preload-control] [--preload-with-fleet] [--host process|in-process]\n'
            );
            process.exit(0);
        }
        if (argument === '--no-preload') {
            preload.enabled = false;
            continue;
        }
        if (argument === '--preload-with-fleet') {
            preload.withFleet = true;
            continue;
        }
        if (argument === '--preload-control') {
            preload.control = true;
            continue;
        }
        if (
            argument === '--workers' ||
            argument === '--preload-radius' ||
            argument === '--preload-ticks' ||
            argument === '--preload-urgency' ||
            argument === '--host'
        ) {
            const value = arguments_[++index];
            if (value === undefined || value.startsWith('--')) throw new Error(`${argument} requires a value`);
            if (argument === '--host') {
                if (value !== 'process' && value !== 'in-process')
                    throw new Error('--host must be process or in-process');
                host = value;
            } else if (argument === '--preload-urgency') {
                if (value !== 'idle' && value !== 'soon' && value !== 'immediate') {
                    throw new Error('--preload-urgency must be idle, soon or immediate');
                }
                preload.urgency = value;
            } else {
                const count = Number.parseInt(value, 10);
                if (!Number.isSafeInteger(count) || count < (argument === '--workers' ? 0 : 1)) {
                    throw new Error(`${argument} must be a whole number in range`);
                }
                if (argument === '--workers') workers = count;
                else if (argument === '--preload-radius') preload.radius = count;
                else preload.ticks = count;
            }
            continue;
        }
        if (argument === '--terrain' || argument === '--baseline' || argument === '--update-baseline') {
            const value = arguments_[++index];
            if (value === undefined || value.startsWith('--')) throw new Error(`${argument} requires a value`);
            if (argument === '--terrain') {
                if (value !== 'flat' && value !== 'real') throw new Error('--terrain must be flat or real');
                terrain = value;
            } else if (argument === '--baseline') baselinePath = path.resolve(value);
            else updateBaselinePath = path.resolve(value);
            continue;
        }
        throw new Error(`Unknown argument ${argument}`);
    }
    if (baselinePath !== undefined && updateBaselinePath !== undefined) {
        throw new Error('Choose either --baseline or --update-baseline');
    }
    return { terrain, baselinePath, updateBaselinePath, preload, workers, host };
};

const availableUdpPort = async (): Promise<number> => {
    const socket = createSocket('udp4');
    await new Promise<void>((resolve, reject) => {
        socket.once('error', reject);
        socket.bind(0, '127.0.0.1', resolve);
    });
    const address = socket.address();
    await new Promise<void>((resolve) => socket.close(() => resolve()));
    return address.port;
};

const makeFleetController = (port: number, workDirectory: string, loginTimeoutMs: number): FleetController => {
    const workerPath = path.resolve(process.cwd(), '../client/benchmarks/fleetWorker.ts');
    const child = fork(workerPath, [], {
        cwd: process.cwd(),
        env: { ...process.env, JSP_DIR: workDirectory },
        execArgv: ['--import', 'tsx'],
        stdio: ['ignore', 'ignore', 'inherit', 'ipc']
    });

    let resolveConnected: (report: FleetWorkerReport) => void;
    let rejectConnected: (error: Error) => void;
    let resolveStopped: (report: FleetWorkerReport) => void;
    let rejectStopped: (error: Error) => void;
    let stopRequested = false;
    const connected = new Promise<FleetWorkerReport>((resolve, reject) => {
        resolveConnected = resolve;
        rejectConnected = reject;
    });
    const stopped = new Promise<FleetWorkerReport>((resolve, reject) => {
        resolveStopped = resolve;
        rejectStopped = reject;
    });

    child.on('message', (message: FleetWorkerMessage) => {
        if (message.type === 'error') {
            const error = new Error(message.message ?? 'Bot worker failed');
            rejectConnected(error);
            rejectStopped(error);
        } else if (message.type === 'progress') {
            process.stderr.write(`[bot-fleet] connected ${message.connected ?? 0}/${message.requested ?? 0}\n`);
        } else if (message.report && message.type === 'connected') resolveConnected(message.report);
        else if (message.report && message.type === 'stopped') resolveStopped(message.report);
    });
    child.once('error', (error) => {
        rejectConnected(error);
        rejectStopped(error);
    });
    child.once('exit', (code, signal) => {
        if (code === 0) return;
        const error = new Error(`Bot worker exited with code ${code ?? 'null'} and signal ${signal ?? 'none'}`);
        rejectConnected(error);
        rejectStopped(error);
    });

    return {
        connected,
        stopped,
        start(seed, count, namePrefix) {
            child.send({
                type: 'start',
                options: {
                    host: '127.0.0.1',
                    port,
                    count,
                    behaviors: ['walk'],
                    ramp: 16,
                    seed,
                    viewDistance: 1,
                    namePrefix,
                    loginTimeoutMs
                }
            });
        },
        stop() {
            if (stopRequested || child.exitCode !== null) return;
            stopRequested = true;
            child.send({ type: 'stop' });
        }
    };
};

const profileSharesFor = (
    events: readonly { readonly name: string; readonly ts: number; readonly dur: number }[],
    start: number,
    end: number
) => {
    // Parent and child spans overlap, so these percentages use the sum of captured span durations.
    const totals = new Map<string, number>();
    let total = 0;
    for (const event of events) {
        const overlap = Math.max(0, Math.min(end, event.ts + event.dur) - Math.max(start, event.ts));
        if (overlap === 0) continue;
        total += overlap;
        totals.set(event.name, (totals.get(event.name) ?? 0) + overlap);
    }
    return Object.fromEntries(
        [...totals.entries()]
            .sort((left, right) => right[1] - left[1])
            .map(([name, duration]) => [name, total === 0 ? 0 : Number(((duration / total) * 100).toFixed(2))])
    );
};

interface PreloadReport {
    readonly radius: number;
    readonly urgency: PreloadOptions['urgency'];
    readonly workers: number | 'default';
    readonly host: 'process' | 'in-process';
    /** The governor's background limit as the preload ended and the lowest it reached; absent without a governor. */
    readonly governorLimit?: { readonly final: number; readonly lowest: number };
    readonly control: boolean;
    readonly loadAverage: readonly number[];
    readonly arms: readonly PreloadArm[];
    readonly tickCost: ReturnType<typeof preloadTickCost>;
    readonly chunksPerCpuSecond: number | undefined;
    readonly workerCpuMs: number;
    readonly labelMsPerChunk: Readonly<Record<string, number>>;
    readonly skipped?: string;
}

/**
 * Asks the generator for a square of chunks all at once, as a preload does, and measures
 * the server's ticks while the request is outstanding. The idle arm asks for nothing,
 * so the arms differ in the work done and in nothing else the benchmark controls.
 */
const runPreload = async (
    server: Server,
    options: PreloadOptions,
    workers: number | undefined,
    host: 'process' | 'in-process'
): Promise<PreloadReport> => {
    const world = server.getWorldManager().getDefaultWorld();
    const generator = world.getGenerator();
    const control = generator.generationControl?.();
    const base = {
        radius: options.radius,
        urgency: options.urgency,
        workers: workers ?? ('default' as const),
        host,
        control: options.control,
        loadAverage: os.loadavg()
    };
    const emptyArm = (name: PreloadArm['name']): PreloadArm => ({
        name,
        ticks: 0,
        tick: summarizeTicks([]),
        chunksLoaded: 0,
        pool: [],
        completionLabels: {}
    });
    if (control === undefined) {
        const idle = emptyArm('idle');
        const full = emptyArm('full');
        return {
            ...base,
            arms: [idle, full],
            tickCost: preloadTickCost(idle, full),
            chunksPerCpuSecond: undefined,
            workerCpuMs: 0,
            labelMsPerChunk: {},
            skipped: 'the default world has no generation workers to hold back'
        };
    }

    const nextTick = () =>
        new Promise<number>((resolve) =>
            server.once('tick', (event: { getTick(): number }) => resolve(event.getTick()))
        );
    const untilTick = (target: number) =>
        new Promise<void>((resolve) => {
            const onTick = (event: { getTick(): number }): void => {
                if (event.getTick() < target) return;
                server.removeListener('tick', onTick);
                resolve();
            };
            server.on('tick', onTick);
        });

    // Different regions per arm, far from spawn and from anywhere the bots walk, so the second arm
    // does not find the first one's chunks already built.
    const centers = [
        { x: 600, z: 600 },
        { x: -600, z: 600 }
    ] as const;

    const runArm = async (name: PreloadArm['name'], center: { x: number; z: number }): Promise<PreloadArm> => {
        const reach = options.radius + 12;
        const inRegion = (task: { chunkX: number; chunkZ: number }): boolean =>
            Math.abs(task.chunkX - center.x) <= reach && Math.abs(task.chunkZ - center.z) <= reach;
        process.stderr.write(`[preload] ${name} arm starting\n`);
        control.resetStats();
        const labelsBefore = server.getChunkCompletionQueue().snapshot().byLabel;

        let chunksLoaded = 0;
        const requests: Promise<void>[] = [];
        const startTick = await nextTick();
        // The idle arm asks for nothing: generation idle is the baseline the plan defines the cost
        // against. Holding the requests in the pool instead would pin the generator's admission
        // slots with builds that never run, and the bots' chunks would never get a turn.
        for (let dz = -options.radius; name === 'full' && dz <= options.radius; dz++) {
            for (let dx = -options.radius; dx <= options.radius; dx++) {
                requests.push(
                    generator
                        .generateChunk(center.x + dx, center.z + dz, world.getSeed(), undefined, {
                            urgency: options.urgency
                        })
                        .then(
                            () => {
                                chunksLoaded++;
                            },
                            () => {}
                        )
                );
            }
        }
        await untilTick(startTick + options.ticks);
        process.stderr.write(`[preload] ${name} arm measured, draining\n`);

        const samples = server.getTickRecorder().between(startTick + 1, startTick + options.ticks + 1);
        const pool = control.stats().byTask;
        const completionLabels = subtractLabelStats(server.getChunkCompletionQueue().snapshot().byLabel, labelsBefore);
        const arm: PreloadArm = {
            name,
            ticks: options.ticks,
            tick: summarizeTicks(samples),
            chunksLoaded,
            pool,
            completionLabels
        };

        // Leave nothing behind for the next arm: drop the backlog, then let the running tasks and
        // their completions finish.
        // Only this arm's own region: dropping anything else would strand the chunks other callers
        // are waiting on.
        control.cancelQueued(inRegion);
        const deadline = performance.now() + 120_000;
        while (control.outstanding() > 0 && performance.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        process.stderr.write(
            `[preload] ${name} arm pool drained, waiting for ${requests.length - chunksLoaded} requests\n`
        );
        await Promise.allSettled(requests);
        process.stderr.write(`[preload] ${name} arm requests settled\n`);
        await untilTick((await nextTick()) + 40);
        return arm;
    };

    // The governor steers background generation from tick lateness, so say what it did.
    let lowestLimit: number | undefined;
    const stopWatching = server.getTickRecorder().subscribe(() => {
        const limit = server.getGenerationLimit();
        if (limit !== undefined) lowestLimit = Math.min(lowestLimit ?? limit, limit);
    });
    const idle = await runArm('idle', centers[0]);
    const full = await runArm(options.control ? 'idle' : 'full', centers[1]);
    stopWatching();
    const finalLimit = server.getGenerationLimit();
    return {
        ...base,
        ...(finalLimit === undefined || lowestLimit === undefined
            ? {}
            : { governorLimit: { final: finalLimit, lowest: lowestLimit } }),
        arms: [idle, full],
        tickCost: preloadTickCost(idle, full),
        chunksPerCpuSecond: chunksPerCpuSecond(full.chunksLoaded, full.pool),
        workerCpuMs: workerCpuMs(full.pool),
        labelMsPerChunk: labelCostPerChunk(full)
    };
};

const writePreloadSummary = (report: PreloadReport): void => {
    const line = (text: string): boolean => process.stderr.write(`[preload] ${text}\n`);
    if (report.skipped !== undefined) {
        line(`skipped: ${report.skipped}`);
        return;
    }
    line(
        `region ${2 * report.radius + 1}x${2 * report.radius + 1} at ${report.urgency}, workers ${report.workers}, host ${report.host}, ` +
            `load average ${report.loadAverage.map((value) => value.toFixed(2)).join(' ')}` +
            (report.control ? ', control run (neither arm asks for chunks)' : '')
    );
    for (const arm of report.arms) {
        line(
            `${arm.name.padEnd(4)} tick p99 ${arm.tick.elapsedMs.p99.toFixed(2)} ms, mean ${arm.tick.elapsedMs.mean.toFixed(2)} ms, ` +
                `late p99 ${arm.tick.latenessMs.p99.toFixed(2)} ms, chunks loaded ${arm.chunksLoaded}`
        );
    }
    const cost = report.tickCost;
    line(
        `wall-clock difference, indicative only (load average above): p99 ${cost.p99ElapsedMs.toFixed(2)} ms, ` +
            `mean ${cost.meanElapsedMs.toFixed(2)} ms, late p99 ${cost.p99LatenessMs.toFixed(2)} ms`
    );
    if (report.chunksPerCpuSecond !== undefined) {
        line(
            `chunks per worker CPU-second ${report.chunksPerCpuSecond.toFixed(2)} (${report.workerCpuMs.toFixed(0)} ms)`
        );
    }
    if (report.governorLimit !== undefined) {
        line(`governor background limit: lowest ${report.governorLimit.lowest}, final ${report.governorLimit.final}`);
    }
    for (const [label, ms] of Object.entries(report.labelMsPerChunk)) {
        line(`main thread per chunk, ${label}: ${ms.toFixed(3)} ms`);
    }
};

const run = async (): Promise<void> => {
    const { terrain, baselinePath, updateBaselinePath, preload, workers, host } = parseArguments(
        process.argv.slice(2).filter((arg) => arg !== '--')
    );
    const previousJspDir = process.env.JSP_DIR;
    const workDirectory = mkdtempSync(path.join(os.tmpdir(), 'jsprismarine-bot-fleet-'));
    process.env.JSP_DIR = workDirectory;

    const profiler = new ServerProfiler();
    const gcEvents: { readonly startTime: number; readonly duration: number }[] = [];
    const gcObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) gcEvents.push({ startTime: entry.startTime, duration: entry.duration });
    });
    gcObserver.observe({ entryTypes: ['gc'] });

    let server: Server | undefined;
    let firstFleet: FleetController | undefined;
    let secondFleet: FleetController | undefined;
    let savedProfile: string | undefined;
    const phaseRecords: PhaseRecord[] = [];
    try {
        const port = await availableUdpPort();
        server = new Server({
            logger: new Logger('error'),
            config: new BenchmarkConfig(terrain, 48, workers, host),
            headless: true
        });
        attachProfiler(server, profiler);
        await server.bootstrap('127.0.0.1', port);
        await new Promise((resolve) => setTimeout(resolve, 100));

        const world = server.getWorldManager().getDefaultWorld();
        const phases = botFleetPhases(terrain);
        const loginTimeoutMs = botFleetLoginTimeoutMs(terrain);
        const runPhase = async (
            name: 'join' | 'steady' | 'crowd',
            ticks: number,
            startWork: (tickDeadline: Promise<void>) => Promise<void>
        ): Promise<void> => {
            const phase = await new Promise<{
                readonly startTick: number;
                readonly startedAtMs: number;
                readonly work: Promise<void>;
                readonly boundary: Promise<{
                    readonly tick: number;
                    readonly endedAtMs: number;
                    readonly cpu: NodeJS.CpuUsage;
                    readonly connectedPlayers: number;
                    readonly entities: number;
                    readonly loadedChunks: number;
                }>;
            }>((resolve, reject) => {
                const startTimer = setTimeout(() => {
                    server!.removeListener('tick', onStart);
                    reject(new Error(`${name} phase did not see a tick start within 15 seconds`));
                }, 15_000);
                startTimer.unref();

                const onStart = (event: { getTick(): number }): void => {
                    clearTimeout(startTimer);
                    const startTick = event.getTick();
                    // TickEvent fires before world work; matching startTick + N brackets exactly N ticks.
                    const startedAtMs = performance.now();
                    const cpuBefore = process.cpuUsage();
                    const targetTick = startTick + ticks;
                    const timeoutMs = Math.max(15_000, ticks * 250);
                    let work: Promise<void>;
                    const boundary = new Promise<{
                        readonly tick: number;
                        readonly endedAtMs: number;
                        readonly cpu: NodeJS.CpuUsage;
                        readonly connectedPlayers: number;
                        readonly entities: number;
                        readonly loadedChunks: number;
                    }>((resolveBoundary, rejectBoundary) => {
                        const timeout = setTimeout(() => {
                            server!.removeListener('tick', onTick);
                            rejectBoundary(
                                new Error(`${name} phase did not reach tick ${targetTick} within ${timeoutMs} ms`)
                            );
                        }, timeoutMs);
                        timeout.unref();

                        const onTick = (tickEvent: { getTick(): number }): void => {
                            if (tickEvent.getTick() !== targetTick) return;
                            clearTimeout(timeout);
                            server!.removeListener('tick', onTick);
                            resolveBoundary({
                                tick: tickEvent.getTick(),
                                endedAtMs: performance.now(),
                                cpu: process.cpuUsage(cpuBefore),
                                connectedPlayers: server!.getSessionManager().getAllPlayers().length,
                                entities: world.getEntities().length,
                                loadedChunks: world.getLoadedChunkCount()
                            });
                        };
                        server!.on('tick', onTick);
                    });

                    try {
                        work = startWork(boundary.then(() => {}));
                    } catch (error: unknown) {
                        work = Promise.reject(error);
                    }
                    resolve({ startTick, startedAtMs, work, boundary });
                };

                server!.once('tick', onStart);
            });

            const workCompletedBeforeBoundary = await Promise.race([
                phase.work.then(() => true),
                phase.boundary.then(() => false)
            ]);
            if (!workCompletedBeforeBoundary) {
                throw new Error(`${name} phase workload did not finish before its ${ticks}-tick boundary`);
            }
            const end = await phase.boundary;
            await yieldToEventLoop();
            const actualTicks = end.tick - phase.startTick;
            if (actualTicks !== ticks) throw new Error(`${name} phase ran ${actualTicks} ticks; expected ${ticks}`);

            const gcInPhase = gcEvents.filter(
                (entry) => entry.startTime >= phase.startedAtMs && entry.startTime < end.endedAtMs
            );
            phaseRecords.push({
                name,
                ticks,
                cpuUsPerTick: (end.cpu.user + end.cpu.system) / ticks,
                wallMs: end.endedAtMs - phase.startedAtMs,
                connectedPlayers: end.connectedPlayers,
                entities: end.entities,
                loadedChunks: end.loadedChunks,
                gc: {
                    count: gcInPhase.length,
                    durationMs: Number(gcInPhase.reduce((sum, entry) => sum + entry.duration, 0).toFixed(3))
                },
                profileSpanShares: {},
                startedAtMs: phase.startedAtMs,
                endedAtMs: end.endedAtMs
            });
        };

        firstFleet = makeFleetController(port, workDirectory, loginTimeoutMs);
        await runPhase('join', phases[0].ticks, async (tickDeadline) => {
            firstFleet!.start(2727, phases[0].bots, 'Join');
            const joinResult = await Promise.race([
                firstFleet!.connected,
                tickDeadline.then(() => {
                    throw new Error('Join fleet did not connect before the join phase ended');
                })
            ]);
            if (joinResult.connected !== phases[0].bots || joinResult.failed !== 0) {
                throw new Error(
                    `Join fleet connected ${joinResult.connected}/${phases[0].bots} bots: ${JSON.stringify(joinResult.failures ?? [])}`
                );
            }
        });

        await runPhase('steady', phases[1].ticks, async () => {});

        secondFleet = makeFleetController(port, workDirectory, loginTimeoutMs);
        await runPhase('crowd', phases[2].ticks, async (tickDeadline) => {
            secondFleet!.start(2728, phases[2].bots, 'Crowd');
            const crowdResult = await Promise.race([
                secondFleet!.connected,
                tickDeadline.then(() => {
                    throw new Error('Crowd fleet did not connect before the crowd phase ended');
                })
            ]);
            if (crowdResult.connected !== phases[2].bots || crowdResult.failed !== 0) {
                throw new Error(
                    `Crowd fleet connected ${crowdResult.connected}/${phases[2].bots} bots: ${JSON.stringify(crowdResult.failures ?? [])}`
                );
            }
        });

        const preloadRequested = preload.enabled ?? terrain === 'real';
        let preloadReport: PreloadReport | undefined;
        if (preloadRequested) {
            // With the fleets still connected the tick carries ordinary play, which is what the
            // plan asks for. In practice a Player's update then stalled forever inside a tick
            // within a minute of the preload starting, so by default the fleets leave first and
            // the preload runs against an empty server. The stall is not diagnosed; see the report.
            if (!preload.withFleet) {
                firstFleet.stop();
                secondFleet.stop();
                await Promise.all([firstFleet.stopped, secondFleet.stopped]);
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }
            preloadReport = await runPreload(server, preload, workers, host);
            writePreloadSummary(preloadReport);
        }

        firstFleet.stop();
        secondFleet.stop();
        await Promise.all([firstFleet.stopped, secondFleet.stopped]);

        savedProfile = await profiler.save();
        const profileEvents = savedProfile
            ? (
                  JSON.parse(readFileSync(savedProfile, 'utf8')).traceEvents as {
                      readonly ph: string;
                      readonly name: string;
                      readonly ts: number;
                      readonly dur: number;
                  }[]
              ).filter((event) => event.ph === 'X')
            : [];
        for (let index = 0; index < phaseRecords.length; index++) {
            const record = phaseRecords[index]!;
            phaseRecords[index] = {
                ...record,
                profileSpanShares: profileSharesFor(profileEvents, record.startedAtMs * 1000, record.endedAtMs * 1000)
            };
        }

        const environment: BotFleetEnvironment = {
            arch: process.arch,
            nodeMajor: Number(process.versions.node.split('.')[0]),
            platform: process.platform,
            cpuModel: os.cpus()[0]?.model ?? 'unknown'
        };
        const report: BotFleetLoadReport & {
            readonly phases: readonly (BotFleetLoadReport['phases'][number] &
                Omit<PhaseRecord, 'startedAtMs' | 'endedAtMs'>)[];
        } = {
            benchmark: 'prismarine-bot-fleet',
            terrain,
            workloadDigest: botFleetWorkloadDigest(terrain),
            environment,
            phases: phaseRecords.map(({ startedAtMs: _startedAtMs, endedAtMs: _endedAtMs, ...phase }) => phase)
        };
        // Cumulative over the whole run, so the join phase's real chunk completions are in it.
        const completionQueue = server.getChunkCompletionQueue().snapshot();
        const reportWithPreload = {
            ...report,
            completionQueue: { ...completionQueue, loadedChunks: world.getLoadedChunkCount() },
            ...(preloadReport === undefined ? {} : { preload: preloadReport })
        };

        if (updateBaselinePath !== undefined) {
            const baseline: BotFleetBaseline = {
                version: 1,
                benchmark: report.benchmark,
                terrain,
                workloadDigest: report.workloadDigest,
                environment: {
                    arch: environment.arch,
                    cpuModel: environment.cpuModel,
                    nodeMajor: environment.nodeMajor,
                    platform: environment.platform
                },
                maxRegressionPercent: BOT_FLEET_MAX_REGRESSION_PERCENT,
                cpuUsPerTick: Object.fromEntries(report.phases.map((phase) => [phase.name, phase.cpuUsPerTick]))
            };
            writeFileSync(updateBaselinePath, `${JSON.stringify(baseline, null, 4)}\n`);
        }

        process.stdout.write(`${JSON.stringify(reportWithPreload)}\n`);
        if (baselinePath !== undefined) {
            const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as BotFleetBaseline;
            const comparison = compareBotFleetBaseline(report, baseline);
            process.stdout.write(`${JSON.stringify({ benchmark: 'prismarine-bot-fleet-gate', ...comparison })}\n`);
            if (!comparison.ok) throw new Error(comparison.error ?? 'Bot-fleet CPU regression exceeded its baseline');
        }
    } finally {
        if (firstFleet !== undefined) {
            try {
                firstFleet.stop();
                await firstFleet.stopped;
            } catch {
                // A worker that already failed is reported by the original phase error.
            }
        }
        if (secondFleet !== undefined) {
            try {
                secondFleet.stop();
                await secondFleet.stopped;
            } catch {
                // A worker that already failed is reported by the original phase error.
            }
        }
        if (server !== undefined) await server.shutdown({ stayAlive: true });
        if (savedProfile === undefined) await profiler.save();
        gcObserver.disconnect();
        if (previousJspDir === undefined) delete process.env.JSP_DIR;
        else process.env.JSP_DIR = previousJspDir;
        rmSync(workDirectory, { recursive: true, force: true });
    }
};

await run();
