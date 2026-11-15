#!/usr/bin/env node
/**
 * Runs the profiling loop against a disposable JSPrismarine server: start a server with its own
 * data directory and port and join bots to it, capture CPU profiles while a named workload runs,
 * and stop every process it started. `analyze.mjs` reads what a capture writes.
 */
import { spawn, spawnSync } from 'node:child_process';
import dgram from 'node:dgram';
import {
    closeSync,
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    openSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync
} from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { busyStretches, readProfile, selfCounts } from './analyze.mjs';
import { openSession } from './cdpClient.mjs';

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SKILL_DIR, '..', '..', '..');
const SCRIPT = 'node .agents/skills/chrome-devtools/profile.mjs';
const SERVER_ENTRY = join(REPO, 'packages', 'server', 'dist', 'Server.js');
const CLIENT_ENTRY = join(REPO, 'packages', 'client', 'dist', 'cli.js');
const TICK_RECORDER = join(REPO, 'packages', 'prismarine', 'dist', 'profiling', 'TickRecorder.js');
const SESSION_FILE = 'session.json';

const HELP = `Usage:
  ${SCRIPT} run --out <dir> [server options] [workload options]
  ${SCRIPT} start [server options]
  ${SCRIPT} capture --session <dir> --out <dir> [workload options]
  ${SCRIPT} capture --inspector <ws-url> --player <name> --out <dir> [workload options]
  ${SCRIPT} stop --session <dir>

run starts a server, captures one workload into --out, stops everything and deletes the
session directory. start, capture and stop do the same in separate steps, so one server can
serve several captures or a manual investigation in between.

Server options (start, run):
  --session <dir>         Session directory: server data, logs and session.json. Default: a new
                          temporary directory.
  --port <n>              UDP port for RakNet; default: a free port.
  --preset <id>           World preset (flat). A bare name means minecraft:<name>; use normal or
                          another noise preset only when the workload is about world generation.
  --seed <seed>           World seed (1).
  --view-distance <n>     Server view distance and what the bots ask for (10).
  --chunk-workers <n>     chunk-workers; default: the server's.
  --chunk-host <host>     process or in-process; default: the server's. Generation workers are
                          profiled only in-process: the inspector cannot reach a separate process.
  --preload-radius <n>    preload-radius; default: the server's.
  --set <key>=<json>      Any other config.json key, repeatable. A value that is not JSON is a string.
  --bots <n>              Bots to join (1). They are named <prefix>0, <prefix>1 and so on.
  --bot-prefix <name>     Bot name prefix (Bot).
  --nice <n>              Start the server and bots with this nice value (0).
  --build                 Build the server and client packages first.
  --ready-timeout <dur>   How long startup and bot joins may take (300s).

Workload options (capture, run):
  --out <dir>             Capture directory; must not hold a capture already.
  --name <name>           Capture name in meta.json (the --out directory's name).
  --workload <name>       walk or idle (walk).
  --steps <n>             walk: teleports (8).
  --step <blocks>         walk: blocks per teleport (32).
  --direction <dir>       walk: +x, -x, +z or -z (+x).
  --from <x>,<z>          walk: start point; default: where the player stands.
  --y <y>                 walk: teleport height (200).
  --step-wait <wait>      walk: settle, which waits until the player's view has loaded and been
                          sent, or a fixed duration such as 6s (settle).
  --step-timeout <dur>    walk: longest settle wait per step (240s).
  --duration <dur>        idle: how long to profile (30s).
  --warmup <dur>          Wait after the player's first view settles, before profiling (5s).
  --workers               Also profile every worker thread the inspector can see.
  --interval-us <n>       Sampling interval in microseconds (500).
  --sample <file>         A JavaScript expression evaluated in the server after every step; its
                          JSON value lands in steps.jsonl.
  --session <dir>         capture: the session to profile.
  --inspector <ws-url>    capture: profile another server started with --devtools instead.
  --player <name>         capture: the player to move; default: the session's first bot.

Stop options:
  --stop-timeout <dur>    How long the server may take to save and exit before it is killed (120s).
  --keep-session          run: keep the session directory; a run that fails always keeps it.

Durations take ms, s, m or h; a bare number is seconds.
`;

const OPTIONS = {
    session: { type: 'string' },
    port: { type: 'string' },
    preset: { type: 'string', default: 'flat' },
    seed: { type: 'string', default: '1' },
    'view-distance': { type: 'string', default: '10' },
    'chunk-workers': { type: 'string' },
    'chunk-host': { type: 'string' },
    'preload-radius': { type: 'string' },
    set: { type: 'string', multiple: true, default: [] },
    bots: { type: 'string', default: '1' },
    'bot-prefix': { type: 'string', default: 'Bot' },
    nice: { type: 'string', default: '0' },
    build: { type: 'boolean', default: false },
    'ready-timeout': { type: 'string', default: '300s' },
    out: { type: 'string' },
    name: { type: 'string' },
    workload: { type: 'string', default: 'walk' },
    steps: { type: 'string', default: '8' },
    step: { type: 'string', default: '32' },
    direction: { type: 'string', default: '+x' },
    from: { type: 'string' },
    y: { type: 'string', default: '200' },
    'step-wait': { type: 'string', default: 'settle' },
    'step-timeout': { type: 'string', default: '240s' },
    duration: { type: 'string', default: '30s' },
    warmup: { type: 'string', default: '5s' },
    workers: { type: 'boolean', default: false },
    'interval-us': { type: 'string', default: '500' },
    sample: { type: 'string' },
    inspector: { type: 'string' },
    player: { type: 'string' },
    'stop-timeout': { type: 'string', default: '120s' },
    'keep-session': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' }
};

const log = (message) => console.error(`profile: ${message}`);

/** Milliseconds in a duration such as 500ms, 30s, 10m or 1h; a bare number is seconds. */
const parseDuration = (value, flag) => {
    const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(String(value).trim());
    if (!match) throw new Error(`${flag} takes a duration such as 30s, 10m or 500ms, got ${value}`);
    const scale = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[match[2] ?? 's'];
    return Number(match[1]) * scale;
};

const parseInteger = (value, flag, { min = 0 } = {}) => {
    if (!/^-?\d+$/.test(String(value)) || Number(value) < min) {
        throw new Error(`${flag} takes a whole number of at least ${min}, got ${value}`);
    }
    return Number(value);
};

/** The command line that ran this process, with the script path relative to the repository. */
const commandLine = () =>
    ['node', relative(REPO, process.argv[1]), ...process.argv.slice(2)]
        .map((part) => (/^[\w@%+=:,./-]+$/.test(part) ? part : `'${part.replaceAll("'", "'\\''")}'`))
        .join(' ');

const git = (...args) => {
    const result = spawnSync('git', args, { cwd: REPO, encoding: 'utf8' });
    return result.status === 0 ? result.stdout.trim() : undefined;
};

const gitState = () => {
    const changed = (git('status', '--porcelain') ?? '').split('\n').filter(Boolean);
    return {
        sha: git('rev-parse', 'HEAD'),
        branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
        dirty: changed.length > 0,
        changed: changed.slice(0, 100)
    };
};

/** The newest modification time of the files directly in a package's dist directory, or 0. */
const builtAt = (packageDir) => {
    const dist = join(packageDir, 'dist');
    if (!existsSync(dist)) return 0;
    let newest = 0;
    for (const entry of readdirSync(dist, { withFileTypes: true })) {
        if (entry.isFile()) newest = Math.max(newest, statSync(join(dist, entry.name)).mtimeMs);
    }
    return newest;
};

/** Workspace packages whose TypeScript sources changed after their last build. */
const staleBuilds = () => {
    const files = (git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'packages/*/src/*.ts') ?? '')
        .split('\n')
        .filter(Boolean);
    const built = new Map();
    const stale = new Set();
    for (const file of files) {
        const name = file.split('/')[1];
        if (!built.has(name)) built.set(name, builtAt(join(REPO, 'packages', name)));
        // A package with no dist is not part of the build the server runs.
        if (built.get(name) === 0) continue;
        const absolute = join(REPO, file);
        if (existsSync(absolute) && statSync(absolute).mtimeMs > built.get(name) + 1000) stale.add(name);
    }
    return [...stale];
};

/** Builds the server and the bot client the way the root server:build script builds the server. */
const build = (nice) => {
    const args = [
        'exec',
        'turbo',
        'run',
        'build',
        '--filter=@jsprismarine/server',
        '--filter=@jsprismarine/client',
        '--env-mode=loose'
    ];
    const [command, commandArgs] = nice > 0 ? ['nice', ['-n', String(nice), 'pnpm', ...args]] : ['pnpm', args];
    log(`building: ${command} ${commandArgs.join(' ')}`);
    const result = spawnSync(command, commandArgs, { cwd: REPO, stdio: ['ignore', 'inherit', 'inherit'] });
    if (result.status !== 0) throw new Error(`the build failed with exit code ${result.status}`);
};

/** A port that UDP and TCP can both bind right now; RakNet listens on UDP, NetherNet signaling on TCP. */
const freePort = async () => {
    for (;;) {
        const port = await new Promise((done, fail) => {
            const socket = dgram.createSocket('udp4');
            socket.once('error', fail);
            socket.bind(0, '127.0.0.1', () => {
                const { port: bound } = socket.address();
                socket.close(() => done(bound));
            });
        });
        const tcpFree = await new Promise((done) => {
            const listener = net.createServer();
            listener.once('error', () => done(false));
            listener.listen(port, '127.0.0.1', () => listener.close(() => done(true)));
        });
        if (tcpFree) return port;
    }
};

/** Linux's start time for a process, which tells a live process from a later one reusing its PID. */
const startTimeOf = (pid) => {
    try {
        const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
        const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
        return { state: fields[0], startTime: fields[19] };
    } catch {
        return undefined;
    }
};

/** Whether the recorded process is still running, and is still the process that was recorded. */
const isRunning = ({ pid, startTime }) => {
    try {
        process.kill(pid, 0);
    } catch {
        return false;
    }
    const current = startTimeOf(pid);
    if (current === undefined) return startTime === undefined;
    return current.state !== 'Z' && (startTime === undefined || current.startTime === startTime);
};

/** Whether any process is left in a process group. */
const groupAlive = (pgid) => {
    try {
        process.kill(-pgid, 0);
        return true;
    } catch {
        return false;
    }
};

const waitUntil = async (condition, timeoutMs, intervalMs = 250) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await condition()) return true;
        await sleep(intervalMs);
    }
    return condition();
};

/**
 * Starts a Node process in a process group of its own, with output appended to a log file. The
 * group is what `stop` signals, so a stop reaches the server's generation host as well, and
 * matches no other process by its command line.
 */
const launch = (args, { cwd, env, logFile, nice }) => {
    const output = openSync(logFile, 'a');
    const [command, commandArgs] =
        nice > 0 ? ['nice', ['-n', String(nice), process.execPath, ...args]] : [process.execPath, args];
    const child = spawn(command, commandArgs, { cwd, env, detached: true, stdio: ['ignore', output, output] });
    closeSync(output);
    const exit = { code: undefined };
    child.once('exit', (code, signal) => {
        exit.code = code ?? signal;
    });
    child.unref();
    return { pid: child.pid, startTime: startTimeOf(child.pid)?.startTime, exit };
};

/**
 * Stops one recorded process: SIGTERM, then SIGKILL to its group once `graceMs` passes, then
 * the same for anything left in its group.
 */
const terminate = async (recorded, label, graceMs) => {
    if (isRunning(recorded)) {
        log(`stopping the ${label} (pid ${recorded.pid})`);
        process.kill(recorded.pid, 'SIGTERM');
        if (!(await waitUntil(() => !isRunning(recorded), graceMs))) {
            log(`the ${label} did not exit within ${graceMs / 1000} s; killing its process group`);
            if (groupAlive(recorded.pid)) process.kill(-recorded.pid, 'SIGKILL');
        }
    }
    // The process group outlives its leader while a child of the leader runs.
    if (groupAlive(recorded.pid) && startTimeOf(recorded.pid) === undefined) {
        process.kill(-recorded.pid, 'SIGTERM');
        if (!(await waitUntil(() => !groupAlive(recorded.pid), 10_000)) && groupAlive(recorded.pid)) {
            process.kill(-recorded.pid, 'SIGKILL');
        }
    }
};

const readSession = (dir) => {
    const file = join(dir, SESSION_FILE);
    if (!existsSync(file)) throw new Error(`${dir} has no ${SESSION_FILE}; was it started with ${SCRIPT} start?`);
    return JSON.parse(readFileSync(file, 'utf8'));
};

const writeSession = (session) =>
    writeFileSync(join(session.dir, SESSION_FILE), `${JSON.stringify(session, null, 4)}\n`);

/** The config.json a session's server reads: only the keys the scenario sets; the server defaults the rest. */
const scenarioConfig = (options, port) => {
    const preset = options.preset.includes(':') ? options.preset : `minecraft:${options.preset}`;
    const config = {
        'server-port': port,
        // An IPv6-only socket can share the IPv4 port number, so no second port is needed.
        'server-portv6': port,
        'online-mode': false,
        'enable-nethernet': false,
        'enable-lan-visibility': false,
        'enable-server-public-ip-lookup': false,
        'level-name': 'world',
        worlds: { world: { preset, seed: options.seed } },
        'view-distance': parseInteger(options['view-distance'], '--view-distance', { min: 1 })
    };
    if (options['chunk-workers'] !== undefined) {
        config['chunk-workers'] = parseInteger(options['chunk-workers'], '--chunk-workers');
    }
    if (options['chunk-host'] !== undefined) config['chunk-host'] = options['chunk-host'];
    if (options['preload-radius'] !== undefined) {
        config['preload-radius'] = parseInteger(options['preload-radius'], '--preload-radius');
    }
    for (const entry of options.set) {
        const separator = entry.indexOf('=');
        if (separator <= 0) throw new Error(`--set takes key=value, got ${entry}`);
        const value = entry.slice(separator + 1);
        try {
            config[entry.slice(0, separator)] = JSON.parse(value);
        } catch {
            config[entry.slice(0, separator)] = value;
        }
    }
    return config;
};

/** Evaluates to the names of the online players. */
const ONLINE_PLAYERS = 'jsprismarine.server.getSessionManager().getAllPlayers().map((player) => player.getName())';

/**
 * Starts a disposable server and joins bots to it. Records every process in the session's
 * session.json as soon as it starts, so `stop` can end whatever a failed start left behind.
 * `onLaunch` runs once the server process exists and session.json records it.
 */
const start = async (options, { onLaunch } = {}) => {
    const nice = parseInteger(options.nice, '--nice');
    const readyMs = parseDuration(options['ready-timeout'], '--ready-timeout');
    const bots = parseInteger(options.bots, '--bots', { min: 1 });
    if (options.build) build(nice);
    for (const entry of [SERVER_ENTRY, CLIENT_ENTRY]) {
        if (!existsSync(entry)) throw new Error(`${relative(REPO, entry)} is missing; pass --build`);
    }
    const stale = staleBuilds();
    if (stale.length > 0) {
        log(`WARNING: sources changed after the last build in ${stale.join(', ')}; pass --build to profile them`);
    }

    const dir = resolve(options.session ?? mkdtempSync(join(os.tmpdir(), 'jsp-profile-')));
    mkdirSync(dir, { recursive: true });
    if (existsSync(join(dir, SESSION_FILE))) {
        const previous = readSession(dir);
        if ([previous.server, previous.bots].some((recorded) => recorded && isRunning(recorded))) {
            throw new Error(`${dir} still has a running session; run ${SCRIPT} stop --session ${dir} first`);
        }
    }
    // A fresh data directory every time, so no capture reuses another's worlds or terrain cache.
    const dataDir = join(dir, 'jsp');
    rmSync(dataDir, { recursive: true, force: true });
    mkdirSync(dataDir, { recursive: true });
    for (const name of ['server.log', 'bot.log']) rmSync(join(dir, name), { force: true });

    const port = options.port === undefined ? await freePort() : parseInteger(options.port, '--port', { min: 1 });
    const config = scenarioConfig(options, port);
    writeFileSync(join(dataDir, 'config.json'), `${JSON.stringify(config, null, 4)}\n`);

    const serverLog = join(dir, 'server.log');
    const server = launch(
        ['--conditions=jsprismarine:dist', '--unhandled-rejections=strict', SERVER_ENTRY, '--no-tui', '--devtools'],
        {
            cwd: join(REPO, 'packages', 'server'),
            env: { ...process.env, JSP_DIR: dataDir, NODE_ENV: 'production' },
            logFile: serverLog,
            nice
        }
    );
    const session = {
        dir,
        dataDir,
        port,
        nice,
        config,
        command: commandLine(),
        startedAt: new Date().toISOString(),
        server: { pid: server.pid, startTime: server.startTime, log: serverLog }
    };
    writeSession(session);
    onLaunch?.();
    log(`server pid ${server.pid} on port ${port}, session ${dir}`);
    try {
        await joinBots(session, server, {
            bots,
            prefix: options['bot-prefix'],
            readyMs,
            nice,
            timeout: options['ready-timeout']
        });
    } catch (error) {
        // A failed start leaves nothing running.
        await stop(dir, options).catch((stopError) => log(`could not stop the session: ${stopError.message}`));
        throw error;
    }
    return session;
};

/** Waits for the server to listen, then starts the bots and waits until every one is online. */
const joinBots = async (session, server, { bots, prefix, readyMs, nice, timeout }) => {
    const serverLog = session.server.log;
    let inspector;
    const ready = await waitUntil(
        () => {
            const text = existsSync(serverLog) ? readFileSync(serverLog, 'utf8') : '';
            inspector ??= /JSPrismarine inspector: (ws:\/\/\S+)/.exec(text)?.[1];
            return server.exit.code !== undefined || (inspector !== undefined && /now listening on port/.test(text));
        },
        readyMs,
        500
    );
    if (!ready || server.exit.code !== undefined) {
        throw new Error(
            server.exit.code !== undefined
                ? `the server exited during startup (${server.exit.code}); see ${serverLog}`
                : `the server was not listening after ${readyMs / 1000} s; see ${serverLog}`
        );
    }
    session.inspector = inspector;
    writeSession(session);

    const botLog = join(session.dir, 'bot.log');
    // The bot client names its players this way.
    const players = Array.from({ length: bots }, (_, index) => `${prefix}${index}`);
    const fleet = launch(
        [
            '--conditions=jsprismarine:dist',
            CLIENT_ENTRY,
            'bot',
            '--host',
            '127.0.0.1',
            '--port',
            String(session.port),
            '--count',
            String(bots),
            '--view-distance',
            String(session.config['view-distance']),
            '--name-prefix',
            prefix,
            '--duration',
            '24h',
            '--timeout',
            timeout
        ],
        { cwd: REPO, env: process.env, logFile: botLog, nice }
    );
    session.bots = { pid: fleet.pid, startTime: fleet.startTime, players, log: botLog };
    writeSession(session);

    const cdp = await openSession(inspector);
    try {
        const joined = await waitUntil(
            async () => {
                if (fleet.exit.code !== undefined) return true;
                const online = await cdp.evaluate(ONLINE_PLAYERS).catch(() => []);
                return players.every((player) => online.includes(player));
            },
            readyMs,
            1000
        );
        if (fleet.exit.code !== undefined) throw new Error(`the bots exited (${fleet.exit.code}); see ${botLog}`);
        if (!joined) throw new Error(`the bots had not joined after ${readyMs / 1000} s; see ${botLog}`);
    } finally {
        cdp.close();
    }
    log(`${players.join(', ')} joined; inspector ${inspector}`);
};

/** Stops a session's bots, then its server, and records when. */
const stop = async (dir, options) => {
    const session = readSession(dir);
    const graceMs = parseDuration(options['stop-timeout'], '--stop-timeout');
    // The bot client prints its report on SIGTERM but then waits out its --duration
    // (JSPrismarine/JSPrismarine#3094), so its group is killed once the report has had time.
    if (session.bots) await terminate(session.bots, 'bots', 5_000);
    if (session.server) await terminate(session.server, 'server', graceMs);
    session.stoppedAt = new Date().toISOString();
    const profiles = join(session.dataDir, 'profiles');
    session.traces = existsSync(profiles)
        ? readdirSync(profiles)
              .filter((name) => name.endsWith('.trace.json'))
              .map((name) => join(profiles, name))
        : [];
    writeSession(session);
    log(`stopped session ${dir}${session.traces.length > 0 ? `; timing trace ${session.traces.join(', ')}` : ''}`);
    return session;
};

/**
 * What the server reports about the player and chunk generation. Session fields are private in
 * TypeScript but readable at runtime; a field that moves reads as null, and `settle` then
 * cannot tell when a view has loaded.
 */
const statusExpression = (player) => `(() => {
    const server = jsprismarine.server;
    const session = server.getSessionManager().findSession({ name: ${JSON.stringify(player)} });
    let control;
    try {
        control = server.getWorldManager().getDefaultWorld()?.getGenerator().generationControl?.();
    } catch {}
    const position = session?.getPlayer().getPosition();
    const size = (value) => value?.size ?? value?.length ?? null;
    return {
        tick: server.getTick(),
        online: session !== null,
        position: position ? [position.getX(), position.getY(), position.getZ()] : null,
        loadedChunks: size(session?.loadedChunks),
        loadingChunks: size(session?.loadingChunks),
        queuedChunks: size(session?.chunkSendQueue),
        outstandingTasks: control?.outstanding?.() ?? null,
        generation: (control?.stats?.().byTask ?? []).map((task) => ({
            status: task.status,
            priority: task.priority,
            tasks: task.tasks,
            failed: task.failed,
            workerCpuMs: Math.round(task.workerCpu.totalMs)
        }))
    };
})()`;

/** The server's effective settings, read back so a capture records defaults the scenario left out. */
const EFFECTIVE_CONFIG = `(() => {
    const config = jsprismarine.server.getConfig();
    return {
        viewDistance: config.getViewDistance(),
        chunkWorkers: config.getChunkWorkers(),
        chunkHost: config.getChunkHost(),
        preloadRadius: config.getPreloadRadius(),
        levelName: config.getLevelName(),
        worlds: config.getWorlds()
    };
})()`;

const THREAD_KEY = "Symbol.for('jsprismarine.profileLoop')";

/** Remembers the main thread's event-loop utilization and CPU time at the start of a capture. */
const THREAD_START = `(() => {
    const { performance } = process.getBuiltinModule('node:perf_hooks');
    globalThis[${THREAD_KEY}] = { elu: performance.eventLoopUtilization(), cpu: process.threadCpuUsage() };
    return true;
})()`;

/** The main thread's event-loop active time and CPU time since THREAD_START, which it then forgets. */
const THREAD_END = `(() => {
    const { performance } = process.getBuiltinModule('node:perf_hooks');
    const start = globalThis[${THREAD_KEY}];
    delete globalThis[${THREAD_KEY}];
    if (!start) return null;
    const elu = performance.eventLoopUtilization(start.elu);
    const cpu = process.threadCpuUsage();
    return {
        eventLoopActiveMs: Math.round(elu.active),
        eventLoopIdleMs: Math.round(elu.idle),
        eventLoopUtilization: Number(elu.utilization.toFixed(4)),
        cpuMs: Math.round((cpu.user - start.cpu.user + cpu.system - start.cpu.system) / 1000)
    };
})()`;

/** Each tick's duration and lateness between two ticks, summarized by the server's own summarizeTicks. */
const tickSummary = async (cdp, firstTick, endTick) => {
    const samples = await cdp.evaluate(`jsprismarine.server.getTickRecorder().between(${firstTick}, ${endTick})`);
    try {
        const { summarizeTicks } = await import(pathToFileURL(TICK_RECORDER).href);
        const summary = summarizeTicks(samples);
        const overruns = Object.values(summary.overrunCauses).reduce((sum, count) => sum + count, 0);
        return { ...summary, overruns };
    } catch (error) {
        return { ticks: samples.length, error: `could not load summarizeTicks: ${error.message}` };
    }
};

/** Sums generation task counters by status and priority, as the difference between two snapshots. */
const generationDelta = (before, after) => {
    const key = (task) => `${task.status}/${task.priority}`;
    const earlier = new Map(before.map((task) => [key(task), task]));
    return after
        .map((task) => {
            const previous = earlier.get(key(task));
            return {
                status: task.status,
                priority: task.priority,
                tasks: task.tasks - (previous?.tasks ?? 0),
                failed: task.failed - (previous?.failed ?? 0),
                workerCpuMs: task.workerCpuMs - (previous?.workerCpuMs ?? 0)
            };
        })
        .filter((task) => task.tasks !== 0 || task.failed !== 0);
};

const DIRECTIONS = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };

/** Waits until the player's view has nothing loading or queued, or the timeout passes. */
const settle = async (cdp, player, timeoutMs) => {
    const startedAt = Date.now();
    let status;
    for (;;) {
        status = await cdp.evaluate(statusExpression(player));
        if (status.loadingChunks === null || status.queuedChunks === null) {
            throw new Error(
                'the server no longer exposes the session chunk fields settle reads; use --step-wait <duration>'
            );
        }
        if (status.loadingChunks === 0 && status.queuedChunks === 0) return { status, timedOut: false };
        if (Date.now() - startedAt > timeoutMs) return { status, timedOut: true };
        await sleep(500);
    }
};

/**
 * Named workloads. Each `describe` is the scenario text compare checks for equality, so two
 * captures of different workloads are flagged.
 */
const WORKLOADS = {
    walk: {
        describe: (plan) =>
            `walk ${plan.steps} x ${plan.step} blocks ${plan.direction} from ${plan.from.join(',')} at y ${plan.y}, ` +
            (plan.stepWait === 'settle' ? 'settling each step' : `${plan.stepWait} per step`),
        plan: async (options, cdp, player) => {
            const direction = DIRECTIONS[options.direction];
            if (!direction) throw new Error('--direction is +x, -x, +z or -z');
            let from;
            if (options.from === undefined) {
                const { position } = await cdp.evaluate(statusExpression(player));
                from = [Math.floor(position[0]), Math.floor(position[2])];
            } else {
                from = options.from.split(',').map((part) => parseInteger(part.trim(), '--from', { min: -30_000_000 }));
                if (from.length !== 2) throw new Error('--from takes <x>,<z>');
            }
            const stepWait = options['step-wait'];
            if (stepWait !== 'settle') parseDuration(stepWait, '--step-wait');
            return {
                steps: parseInteger(options.steps, '--steps', { min: 1 }),
                step: parseInteger(options.step, '--step', { min: 1 }),
                direction: options.direction,
                from,
                y: parseInteger(options.y, '--y', { min: -64 }),
                stepWait,
                stepTimeoutMs: parseDuration(options['step-timeout'], '--step-timeout')
            };
        },
        run: async (plan, { cdp, player, record }) => {
            const [dx, dz] = DIRECTIONS[plan.direction];
            for (let step = 1; step <= plan.steps; step++) {
                const x = plan.from[0] + dx * step * plan.step;
                const z = plan.from[1] + dz * step * plan.step;
                const command = `tp ${player} ${x} ${plan.y} ${z}`;
                await cdp.evaluate(`(async () => {
                    const server = jsprismarine.server;
                    const sender = server.getConsole();
                    await server.getCommandManager().dispatchCommand(sender, sender, ${JSON.stringify(command)});
                    return true;
                })()`);
                const startedAt = Date.now();
                let result;
                if (plan.stepWait === 'settle') {
                    // The teleport queues the new view on a later tick.
                    await sleep(1000);
                    result = await settle(cdp, player, plan.stepTimeoutMs);
                } else {
                    await sleep(parseDuration(plan.stepWait, '--step-wait'));
                    result = { status: await cdp.evaluate(statusExpression(player)), timedOut: false };
                }
                await record({ step, x, z, waitedMs: Date.now() - startedAt, ...result });
            }
        }
    },
    idle: {
        describe: (plan) => `idle for ${plan.durationMs / 1000} s`,
        plan: async (options) => ({ durationMs: parseDuration(options.duration, '--duration') }),
        run: async (plan, { cdp, player, record }) => {
            await sleep(plan.durationMs);
            await record({ step: 1, status: await cdp.evaluate(statusExpression(player)), timedOut: false });
        }
    }
};

const loadAverage = () => os.loadavg().map((value) => Number(value.toFixed(2)));

/** Profiles one workload and writes main.cpuprofile, worker-N.cpuprofile, steps.jsonl and meta.json. */
const capture = async (options) => {
    if (!options.out) throw new Error('capture needs --out <dir>');
    const out = resolve(options.out);
    if (existsSync(join(out, 'meta.json')) || existsSync(join(out, 'main.cpuprofile'))) {
        throw new Error(`${out} already holds a capture; choose another --out`);
    }
    const session = options.session === undefined ? undefined : readSession(resolve(options.session));
    const inspector = options.inspector ?? session?.inspector;
    const player = options.player ?? session?.bots?.players[0];
    if (!inspector) throw new Error('capture needs --session <dir> or --inspector <ws-url>');
    if (!player) throw new Error('capture needs --player <name> without a session');
    const workload = WORKLOADS[options.workload];
    if (!workload) throw new Error(`--workload is one of ${Object.keys(WORKLOADS).join(', ')}`);
    const intervalUs = parseInteger(options['interval-us'], '--interval-us', { min: 50 });
    const warmupMs = parseDuration(options.warmup, '--warmup');
    const sampleExpression = options.sample === undefined ? undefined : readFileSync(options.sample, 'utf8');
    mkdirSync(out, { recursive: true });

    const capturedAt = new Date().toISOString();
    const cdp = await openSession(inspector);
    try {
        if (options.workers) {
            await cdp.send('NodeWorker.enable', { waitForDebuggerOnStart: false });
            await sleep(500);
        }
        const online = await waitUntil(
            async () => (await cdp.evaluate(ONLINE_PLAYERS).catch(() => [])).includes(player),
            60_000,
            1000
        );
        if (!online) throw new Error(`${player} is not online`);
        const effective = await cdp.evaluate(EFFECTIVE_CONFIG).catch((error) => ({ error: error.message }));
        if (options.workers && effective.chunkHost === 'process') {
            log('chunk-host is process: generation workers run in another process the inspector cannot reach');
        }

        log(`waiting for ${player}'s view to settle`);
        const initial = await settle(cdp, player, 600_000);
        if (initial.timedOut) log('WARNING: the first view did not settle within 600 s; profiling anyway');
        await sleep(warmupMs);

        const plan = await workload.plan(options, cdp, player);
        const description = workload.describe(plan);
        const cpus = os.availableParallelism();
        const loadBefore = loadAverage();
        if (loadBefore[0] > cpus / 2) {
            log(`WARNING: load average ${loadBefore[0]} on ${cpus} CPUs; sampled shares will be noisier`);
        }
        const before = await cdp.evaluate(statusExpression(player));

        const profiled = options.workers ? [...cdp.workers] : [];
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.setSamplingInterval', { interval: intervalUs });
        for (const [sessionId] of profiled) {
            await cdp.sendToWorker(sessionId, 'Profiler.enable');
            await cdp.sendToWorker(sessionId, 'Profiler.setSamplingInterval', { interval: intervalUs });
        }
        await cdp.evaluate(THREAD_START);
        await cdp.send('Profiler.start');
        for (const [sessionId] of profiled) await cdp.sendToWorker(sessionId, 'Profiler.start');
        const profileStartedAt = new Date().toISOString();
        log(`profiling: ${description}`);

        const steps = [];
        await workload.run(plan, {
            cdp,
            player,
            record: async (entry) => {
                if (sampleExpression !== undefined) {
                    entry.sample = await cdp.evaluate(sampleExpression).catch((error) => ({ error: error.message }));
                }
                steps.push(entry);
                const { status } = entry;
                log(
                    `step ${entry.step}: ${status.loadedChunks} chunks loaded` +
                        (status.outstandingTasks === null
                            ? ''
                            : `, ${status.outstandingTasks} generation tasks outstanding`) +
                        (entry.timedOut ? ', TIMED OUT' : '')
                );
            }
        });

        const { profile } = await cdp.send('Profiler.stop');
        const profileStoppedAt = new Date().toISOString();
        writeFileSync(join(out, 'main.cpuprofile'), JSON.stringify(profile));
        const workers = [];
        for (const [index, [sessionId, title]] of profiled.entries()) {
            const file = `worker-${index}.cpuprofile`;
            const result = await cdp.sendToWorker(sessionId, 'Profiler.stop');
            writeFileSync(join(out, file), JSON.stringify(result.profile));
            workers.push({ file, title });
        }
        const thread = await cdp.evaluate(THREAD_END);
        const after = await cdp.evaluate(statusExpression(player));
        const loadAfter = loadAverage();
        const ticks = await tickSummary(cdp, before.tick, after.tick);

        writeFileSync(join(out, 'steps.jsonl'), steps.map((entry) => `${JSON.stringify(entry)}\n`).join(''));
        const meta = {
            name: options.name ?? basename(out),
            indicative:
                'CPU samples, tick timings, thread times and load averages are wall-clock measurements: compare them only between captures on one host at similar load, and treat differences as indicative. The counts are what the code decided.',
            command: commandLine(),
            git: gitState(),
            host: { platform: process.platform, arch: process.arch, cpus, node: process.version },
            load: { before: loadBefore, after: loadAfter },
            time: { capturedAt, profileStartedAt, profileStoppedAt },
            server: {
                inspector,
                session: session?.dir,
                nice: session?.nice,
                config: session?.config,
                effective
            },
            workload: { name: options.workload, description, player, warmupMs, ...plan },
            profile: { intervalUs, main: 'main.cpuprofile', workers },
            counts: {
                ticks: after.tick - before.tick,
                loadedChunks: after.loadedChunks,
                stepsTimedOut: steps.filter((entry) => entry.timedOut).length,
                generation: generationDelta(before.generation, after.generation)
            },
            ticks,
            thread
        };
        writeFileSync(join(out, 'meta.json'), `${JSON.stringify(meta, null, 4)}\n`);
        report(out, meta);
        return meta;
    } finally {
        cdp.close();
    }
};

/** A few lines on the capture: counts first, then the indicative shares. */
const report = (out, meta) => {
    const main = readProfile(join(out, 'main.cpuprofile'));
    const stretches = busyStretches(main);
    const share = (us) => ((100 * us) / main.total).toFixed(1);
    const tasks = meta.counts.generation.reduce((sum, task) => sum + task.tasks, 0);
    console.log(`capture ${meta.name} in ${out}`);
    console.log(
        `counts: ${meta.counts.ticks} ticks, ${meta.counts.loadedChunks} chunks loaded, ${tasks} generation tasks settled, ${meta.counts.stepsTimedOut} steps timed out`
    );
    console.log(
        `indicative (load ${meta.load.before.join(' ')} -> ${meta.load.after.join(' ')} on ${meta.host.cpus} CPUs): ` +
            `main thread busy ${share(main.total - main.idle)}%, gc ${share(selfCounts(main).get('(garbage collector)') ?? 0)}%, ` +
            `${stretches.filter((stretch) => stretch.us >= 50_000).length} busy stretches >= 50 ms, ` +
            `${meta.ticks.overruns ?? '?'} ticks over the period, main thread CPU ${meta.thread?.cpuMs ?? '?'} ms`
    );
    const shown = relative(process.cwd(), out);
    console.log(
        `next: node .agents/skills/chrome-devtools/analyze.mjs summary ${shown.startsWith('..') ? out : shown || '.'}`
    );
};

/** Copies a session's logs, config and timing traces into a capture directory. */
const collect = (session, out) => {
    const copies = [
        [session.server?.log, 'server.log'],
        [session.bots?.log, 'bot.log'],
        [join(session.dataDir, 'config.json'), 'config.json'],
        ...(session.traces ?? []).map((file) => [file, basename(file)])
    ];
    for (const [from, name] of copies) {
        if (from && existsSync(from)) copyFileSync(from, join(out, name));
    }
};

/** Starts a session, captures one workload, stops the session, and keeps only the capture. */
const run = async (options) => {
    if (!options.out) throw new Error('run needs --out <dir>');
    const out = resolve(options.out);
    if (existsSync(join(out, 'meta.json'))) throw new Error(`${out} already holds a capture; choose another --out`);
    // Cleanup deletes the session directory, and with it a capture written inside it.
    if (options.session !== undefined && !options['keep-session']) {
        const session = resolve(options.session);
        const fromSession = relative(session, out);
        if (!(fromSession === '..' || fromSession.startsWith(`..${sep}`) || isAbsolute(fromSession))) {
            throw new Error(
                `--out ${out} is inside --session ${session}, which run deletes when it finishes; ` +
                    'choose an --out outside it or pass --keep-session'
            );
        }
    }
    const dir = resolve(options.session ?? mkdtempSync(join(os.tmpdir(), 'jsp-profile-')));

    // Cleanup stops and deletes only a session this run launched. When start refuses a
    // directory whose session still runs, that session and its directory stay as they were.
    let launched = false;
    let stopping;
    let captured = false;
    const cleanUp = async () => {
        stopping ??= (async () => {
            if (!launched) return;
            const session = await stop(dir, options);
            if (existsSync(out)) collect(session, out);
            // A run that failed keeps its session, whose server and bot logs say why.
            if (!captured) log(`kept session ${dir} with its logs; delete it when done`);
            else if (!options['keep-session']) rmSync(dir, { recursive: true, force: true });
        })();
        return stopping;
    };
    const interrupt = () => {
        log('interrupted; stopping the session');
        void cleanUp().finally(() => process.exit(130));
    };
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    try {
        await start(
            { ...options, session: dir },
            {
                onLaunch: () => {
                    launched = true;
                }
            }
        );
        await capture({ ...options, session: dir });
        captured = true;
    } finally {
        await cleanUp();
        process.off('SIGINT', interrupt);
        process.off('SIGTERM', interrupt);
    }
};

const main = async () => {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: OPTIONS });
    const [command, ...rest] = positionals;
    if (values.help || !command || command === 'help') {
        process.stdout.write(HELP);
        return;
    }
    if (rest.length > 0) throw new Error(`unexpected argument ${rest[0]}`);
    switch (command) {
        case 'run':
            await run(values);
            break;
        case 'start':
            console.log((await start(values)).dir);
            break;
        case 'capture':
            await capture(values);
            break;
        case 'stop':
            if (!values.session) throw new Error('stop needs --session <dir>');
            await stop(resolve(values.session), values);
            break;
        default:
            throw new Error(`unknown command ${command}\n\n${HELP}`);
    }
};

try {
    await main();
} catch (error) {
    console.error(`profile: ${error.message}`);
    process.exitCode = 1;
}
