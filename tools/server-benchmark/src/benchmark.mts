/**
 * Runs the workload against one server and measures it, and orders the runs into rounds.
 *
 * A run has four parts. Startup ends when the first bot stands in the world. Join starts when the
 * server prints that it listens, connects the bots one at a time, waits for their first views, teleports them to the origin and waits again.
 * Travel teleports every bot outward along its own heading, a fixed distance per step, and waits
 * for the new chunks after each step. Idle leaves the bots standing for a fixed time. CPU time and
 * what the bots received are read at each boundary; memory is sampled throughout.
 */
import { execFileSync } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { loadavg } from 'node:os';
import path from 'node:path';

import { BenchmarkFleet } from './fleet.mts';
import { ServerProcess } from './serverProcess.mts';
import { TreeMonitor } from './processTree.mts';
import { REPO } from './servers.mts';

import type { FleetCounters } from './fleet.mts';
import type {
    LoadAverages,
    PhaseMeasurement,
    RunResult,
    ScenarioDescription,
    ServerId,
    SettingChange
} from './results.mts';
import type { ServerDefinition } from './servers.mts';
import type { LaunchSpec } from './serverProcess.mts';

/** How long no terrain may arrive before the harness counts a step as settled. */
export const SETTLE_QUIET_MS = 3000;
/** How often the process tree's memory is sampled. */
export const MEMORY_SAMPLE_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The load averages now, rounded to two decimals. */
export const readLoad = (): LoadAverages => {
    const [one = 0, five = 0, fifteen = 0] = loadavg();
    const round = (value: number) => Number(value.toFixed(2));
    return [round(one), round(five), round(fifteen)];
};

/**
 * Waits until the one minute load is at or under `limit`, or `maxMs` passes. Runs one after
 * another, so without the wait each server would start while the last one's load still decays.
 */
export const coolDown = async (limit: number, maxMs: number): Promise<LoadAverages> => {
    const deadline = performance.now() + maxMs;
    while (readLoad()[0] > limit && performance.now() < deadline) await sleep(1000);
    return readLoad();
};

/**
 * Waits until no socket of any kind uses `port`, or `maxMs` passes, and returns whether it is free.
 *
 * A server's process can be gone while its port is not: Bedrock Dedicated Server's NetherNet
 * signaling connections left port 19132 unusable for a few seconds after it quit, and the next
 * server then failed to bind it. On Linux this reads `ss`, which lists sockets in every state;
 * elsewhere it tries to bind the port.
 */
export const waitForFreePort = async (port: number, maxMs: number): Promise<boolean> => {
    const deadline = performance.now() + maxMs;
    for (;;) {
        if (await portIsFree(port)) return true;
        if (performance.now() > deadline) return false;
        await sleep(1000);
    }
};

const portIsFree = async (port: number): Promise<boolean> => {
    if (process.platform === 'linux') {
        try {
            const sockets = execFileSync('ss', ['-Htuan', `( sport = :${port} )`], { encoding: 'utf8' });
            return sockets.trim() === '';
        } catch {
            // Without `ss`, the bind test below still finds a listener.
        }
    }
    const tcp = await new Promise<boolean>((resolve) => {
        const server = createServer();
        server.once('error', () => resolve(false));
        server.listen(port, '0.0.0.0', () => server.close(() => resolve(true)));
    });
    if (!tcp) return false;
    return new Promise<boolean>((resolve) => {
        const socket = createSocket('udp4');
        socket.once('error', () => resolve(false));
        socket.bind(port, '0.0.0.0', () => socket.close(() => resolve(true)));
    });
};

/** The order of the servers in a round: the list rotated by the round number. */
export const roundOrder = (servers: readonly ServerId[], round: number): ServerId[] =>
    servers.map((_, index) => servers[(index + round) % servers.length]!);

/** Where bot `index` of `count` stands after `step` steps of `stepBlocks` from the origin. */
export const stepTarget = (index: number, count: number, step: number, stepBlocks: number) => {
    const heading = (2 * Math.PI * index) / count;
    // `+ 0` turns the -0 a rounded -1e-14 gives into 0, which is what the `tp` command line shows.
    return {
        x: Math.round(Math.cos(heading) * step * stepBlocks) + 0,
        z: Math.round(Math.sin(heading) * step * stepBlocks) + 0
    };
};

/** What {@link runOnce} needs: the server and scenario, where to work, and how long each wait may take. */
export interface RunOptions {
    readonly server: ServerDefinition;
    readonly scenario: ScenarioDescription;
    readonly round: number;
    readonly position: number;
    readonly workDir: string;
    readonly seed: number;
    readonly port: number;
    readonly readyTimeoutMs: number;
    readonly loginTimeoutMs: number;
    readonly stopTimeoutMs: number;
    /** The one minute load the harness waits for before it starts the server. */
    readonly quietLoadLimit: number;
    /** The longest wait for the load to settle and for the port to be free. */
    readonly cooldownMs: number;
    readonly log: (line: string) => void;
    /** Called with the command line and the setting changes once the data directory is written. */
    readonly onPrepared?: (prepared: { command: string; settings: readonly SettingChange[] }) => void;
}

/** A launch as one shell line, with the run's own directory and the repository written as placeholders. */
export const describeLaunch = (launch: LaunchSpec, dir: string, repo: string): string =>
    [
        ...Object.entries(launch.env ?? {}).map(([key, value]) => `${key}=${value}`),
        launch.command === process.execPath ? 'node' : launch.command,
        ...launch.args
    ]
        .join(' ')
        .replaceAll(dir, '<data dir>')
        .replaceAll(`${repo}${path.sep}`, '');

/** Measures one phase: the CPU and fleet counters before and after `body`. */
const phase = async (
    monitor: TreeMonitor,
    fleet: BenchmarkFleet,
    body: () => Promise<number>
): Promise<PhaseMeasurement> => {
    const startedAt = performance.now();
    const cpuBefore = monitor.sample().cpuMs;
    const before: FleetCounters = fleet.counters();
    const stepsTimedOut = await body();
    const after = fleet.counters();
    return {
        wallMs: Math.round(performance.now() - startedAt),
        cpuMs: Math.round(monitor.sample().cpuMs - cpuBefore),
        columns: after.columns - before.columns,
        columnPackets: after.columnPackets - before.columnPackets,
        sections: after.sections - before.sections,
        bytesReceived: after.bytesReceived - before.bytesReceived,
        stepsTimedOut
    };
};

/** Stops the server and bots of each run in progress. */
const activeRuns = new Set<() => Promise<void>>();

/**
 * Stops every run in progress: disconnects its bots and stops its server and the server's process
 * group. The harness calls it when it is interrupted, since a server in its own process group does
 * not receive the terminal's signal.
 */
export const stopActiveRuns = async (): Promise<void> => {
    await Promise.all([...activeRuns].map((stop) => stop()));
};

/**
 * Runs the workload against one server from a fresh data directory. Anything a run with the same
 * work directory, round, scenario and server left there is removed first.
 */
export const runOnce = async (options: RunOptions): Promise<RunResult> => {
    const { server, scenario, log } = options;
    const dir = path.join(options.workDir, `round-${options.round}`, `${scenario.id}-${server.id}`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const startedAt = new Date().toISOString();
    let loadBefore = readLoad();
    const fleet = new BenchmarkFleet({
        host: '127.0.0.1',
        port: options.port,
        network: server.transport,
        bots: scenario.bots,
        viewDistance: scenario.viewDistance,
        seed: options.seed,
        loginTimeoutMs: options.loginTimeoutMs,
        rampMs: 250
    });
    let serverProcess: ServerProcess | undefined;
    let monitor: TreeMonitor | undefined;
    let startupMs: number | null = null;
    let startupCpuMs: number | null = null;
    let phases: RunResult['phases'] = null;
    let idleRssBytes = 0;
    let error: string | undefined;
    const stopRun = async () => {
        fleet.disconnect();
        await serverProcess?.stop(options.stopTimeoutMs);
    };
    activeRuns.add(stopRun);
    try {
        const prepared = await server.prepare(dir, {
            scenario: scenario.id,
            seed: options.seed,
            viewDistance: scenario.viewDistance,
            simulationDistance: scenario.simulationDistance,
            maxPlayers: scenario.bots,
            port: options.port,
            stageDir: path.join(options.workDir, 'stage')
        });
        options.onPrepared?.({ command: describeLaunch(prepared.launch, dir, REPO), settings: prepared.settings });
        // After preparation, which for Pumpkin starts and stops a server of its own, so the load and
        // the port describe the machine the measured server starts on.
        if (!(await waitForFreePort(options.port, options.cooldownMs))) {
            log(`port ${options.port} is still in use; starting anyway`);
        }
        loadBefore = await coolDown(options.quietLoadLimit, options.cooldownMs);
        log(`load ${loadBefore.join(' ')}`);
        serverProcess = new ServerProcess(prepared.launch, path.join(dir, 'server.log'));
        monitor = new TreeMonitor(serverProcess.pid);
        monitor.start(MEMORY_SAMPLE_MS);
        await serverProcess.waitReady(options.readyTimeoutMs);
        const running = serverProcess;
        const tree = monitor;

        const tpAll = (place: (index: number) => { x: number; z: number }) => {
            for (const [index, name] of fleet.names.entries()) {
                const { x, z } = place(index);
                running.command(`tp ${name} ${x} ${scenario.teleportY} ${z}`);
            }
        };

        const join = await phase(tree, fleet, async () => {
            await fleet.joinFirst();
            startupMs = Math.round(performance.now() - running.startedAt);
            startupCpuMs = Math.round(tree.sample().cpuMs);
            await fleet.joinRest();
            log(`${fleet.joinedCount()} bots joined`);
            const first = await fleet.settle({
                quietMs: SETTLE_QUIET_MS,
                graceMs: 0,
                timeoutMs: scenario.stepTimeoutMs
            });
            fleet.markStep();
            tpAll(() => ({ x: 0, z: 0 }));
            const origin = await fleet.settle({
                quietMs: SETTLE_QUIET_MS,
                graceMs: 5000,
                timeoutMs: scenario.stepTimeoutMs
            });
            return Number(first.timedOut) + Number(origin.timedOut);
        });
        log(`join: ${join.columns} columns, ${(join.cpuMs / 1000).toFixed(1)} CPU s`);

        const travel = await phase(tree, fleet, async () => {
            let timedOut = 0;
            for (let step = 1; step <= scenario.steps; step++) {
                fleet.markStep();
                tpAll((index) => stepTarget(index, scenario.bots, step, scenario.stepBlocks));
                const settled = await fleet.settle({
                    quietMs: SETTLE_QUIET_MS,
                    graceMs: 20_000,
                    timeoutMs: scenario.stepTimeoutMs
                });
                if (settled.timedOut) timedOut++;
            }
            return timedOut;
        });
        log(
            `travel: ${travel.columns} columns, ${(travel.cpuMs / 1000).toFixed(1)} CPU s, ${travel.stepsTimedOut} steps timed out`
        );

        const idle = await phase(tree, fleet, async () => {
            await sleep(scenario.idleMs);
            return 0;
        });
        idleRssBytes = tree.sample().rssBytes;
        log(`idle: ${(idle.cpuMs / 1000).toFixed(1)} CPU s over ${(idle.wallMs / 1000).toFixed(0)} s`);
        phases = { join, travel, idle };
        if (fleet.connectedCount() < scenario.bots) {
            error = `${scenario.bots - fleet.connectedCount()} bots left early: ${fleet.disconnects().join('; ')}`;
        }
    } catch (caught: unknown) {
        error = caught instanceof Error ? caught.message : String(caught);
        log(`failed: ${error}`);
    } finally {
        await stopRun();
        activeRuns.delete(stopRun);
        monitor?.stop();
    }
    return {
        server: server.id,
        scenario: scenario.id,
        round: options.round,
        position: options.position,
        ok: error === undefined,
        ...(error === undefined ? {} : { error }),
        startedAt,
        load: { before: loadBefore, after: readLoad() },
        startupMs,
        startupCpuMs,
        phases,
        peakRssBytes: monitor?.peakRssBytes ?? 0,
        idleRssBytes,
        processes: monitor?.peakProcesses ?? 0,
        bots: {
            requested: scenario.bots,
            joined: fleet.joinedCount(),
            grantedRadius: fleet.grantedRadius(),
            disconnects: fleet.disconnects()
        }
    };
};
