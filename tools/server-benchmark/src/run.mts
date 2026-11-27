/**
 * Runs JSPrismarine, Pumpkin and Bedrock Dedicated Server under one bot workload and writes every
 * measurement to a results file.
 *
 * Run `pnpm run bench:servers` after building the server and the client; `--help` lists the options. Each round runs
 * every server once per scenario, in an order that rotates from round to round, so background load
 * on the machine falls on all of them alike. Before each run the harness waits for the one minute
 * load to fall to a quarter of the logical CPUs, and it records the load before and after every run
 * and round. The file is rewritten after every run, so an interrupted benchmark keeps what it measured.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { availableParallelism, cpus, release, tmpdir, totalmem } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { PROTOCOL_VERSION } from '@jsprismarine/client';

import {
    MEMORY_SAMPLE_MS,
    SETTLE_QUIET_MS,
    coolDown,
    readLoad,
    roundOrder,
    runOnce,
    stopActiveRuns
} from './benchmark.mts';
import { readInputs } from './inputs.mts';
import { RESULTS_SCHEMA, SCENARIO_IDS, SERVER_IDS, failedJspRuns, mergeSettings } from './results.mts';
import { resultsDirName } from './resultsFiles.mts';
import { DEFAULT_PORT, REPO, SERVERS, bdsPin, useJspExecutable } from './servers.mts';
import { isQuietLoad, quietLoadLimit } from './summary.mts';

import type {
    BenchmarkResults,
    RoundResult,
    RunResult,
    ScenarioDescription,
    ScenarioId,
    ServerDescription,
    ServerId
} from './results.mts';

const HELP = `Usage: pnpm run bench:servers [options]

  --rounds <n>            Rounds; each runs every server once per scenario (5).
  --servers <list>        Servers, comma separated: ${SERVER_IDS.join(', ')} (all).
  --scenarios <list>      Scenarios, comma separated: ${SCENARIO_IDS.join(', ')} (all).
  --flat-bots <n>         Bots in the flat scenario (10).
  --terrain-bots <n>      Bots in the terrain scenario (3).
  --view-distance <n>     View distance every server is given and every bot asks for (10).
  --steps <n>             Teleports per bot in the travel phase (6).
  --step-blocks <n>       Blocks per teleport (64).
  --idle <seconds>        Length of the idle phase (30).
  --seed <n>              World seed on every server (1).
  --port <n>              Port every server listens on (19132, each server's default).
  --cooldown <seconds>    Longest wait for the load to settle before a run (180).
  --skip-unavailable      Leave out a server this host cannot run instead of stopping.
  --out <file>            Results file (docs/research/benchmarks/<start time>/results.json).
  --work <dir>            Directory for the servers' data (a new temporary directory).
  --jsp-executable <file> Benchmark this packaged JSPrismarine executable instead of the built
                          entry under Node.js, as CI does with the Bun AOT build.
`;

const OPTIONS = {
    rounds: { type: 'string', default: '5' },
    servers: { type: 'string', default: SERVER_IDS.join(',') },
    scenarios: { type: 'string', default: SCENARIO_IDS.join(',') },
    'flat-bots': { type: 'string', default: '10' },
    'terrain-bots': { type: 'string', default: '3' },
    'view-distance': { type: 'string', default: '10' },
    steps: { type: 'string', default: '6' },
    'step-blocks': { type: 'string', default: '64' },
    idle: { type: 'string', default: '30' },
    seed: { type: 'string', default: '1' },
    port: { type: 'string', default: String(DEFAULT_PORT) },
    cooldown: { type: 'string', default: '180' },
    'skip-unavailable': { type: 'boolean', default: false },
    out: { type: 'string' },
    'jsp-executable': { type: 'string' },
    work: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false }
} as const;

/** JSPrismarine's simulation distance is a constant, so the others are set to match it. */
const SIMULATION_DISTANCE = 10;

const log = (line: string) => console.error(`benchmark: ${line}`);

const positiveInteger = (value: string, flag: string): number => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1)
        throw new Error(`--${flag} takes a whole number of at least 1, got ${value}`);
    return parsed;
};

const listOf = <T extends string>(value: string, allowed: readonly T[], flag: string): T[] =>
    value.split(',').map((entry) => {
        const match = allowed.find((candidate) => candidate === entry.trim());
        if (match === undefined) throw new Error(`--${flag} takes ${allowed.join(', ')}, got ${entry}`);
        return match;
    });

const osName = (): string => {
    if (existsSync('/etc/os-release')) {
        const pretty = /^PRETTY_NAME="?([^"\n]*)"?$/m.exec(readFileSync('/etc/os-release', 'utf8'))?.[1];
        if (pretty) return pretty;
    }
    return `${process.platform} ${release()}`;
};

const ciRun = (): BenchmarkResults['environment']['ci'] => {
    const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, RUNNER_NAME, ImageOS, ImageVersion } = process.env;
    if (!GITHUB_RUN_ID || !GITHUB_REPOSITORY) return null;
    return {
        runUrl: `${GITHUB_SERVER_URL ?? 'https://github.com'}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`,
        runner: [RUNNER_NAME, ImageOS, ImageVersion].filter(Boolean).join(' ')
    };
};

/** The command line that ran this process, with paths relative to the repository. */
const commandLine = (): string =>
    ['node', path.relative(REPO, process.argv[1]!), ...process.argv.slice(2)]
        .map((part) => (/^[\w@%+=:,./-]+$/.test(part) ? part : `'${part.replaceAll("'", "'\\''")}'`))
        .join(' ');

const main = async (): Promise<void> => {
    // `pnpm run bench:servers -- --rounds 1` hands the `--` on as an argument of its own.
    const args = process.argv.slice(2);
    const { values } = parseArgs({
        args: args[0] === '--' ? args.slice(1) : args,
        options: OPTIONS,
        allowPositionals: false
    });
    if (values.help) {
        process.stdout.write(HELP);
        return;
    }
    if (values['jsp-executable'] !== undefined) useJspExecutable(values['jsp-executable']);
    const rounds = positiveInteger(values.rounds, 'rounds');
    const scenarioIds = listOf<ScenarioId>(values.scenarios, SCENARIO_IDS, 'scenarios');
    const requested = listOf<ServerId>(values.servers, SERVER_IDS, 'servers');
    const viewDistance = positiveInteger(values['view-distance'], 'view-distance');
    const seed = positiveInteger(values.seed, 'seed');
    const port = positiveInteger(values.port, 'port');
    const cooldownMs = positiveInteger(values.cooldown, 'cooldown') * 1000;

    const pin = bdsPin();
    if (PROTOCOL_VERSION !== pin.protocol) {
        throw new Error(
            `the bots speak protocol ${PROTOCOL_VERSION}, but the pinned Bedrock Dedicated Server speaks ${pin.protocol}`
        );
    }

    const servers: ServerId[] = [];
    for (const id of requested) {
        const reason = SERVERS[id].unavailable();
        if (reason === null) servers.push(id);
        else if (values['skip-unavailable']) log(`leaving out ${SERVERS[id].name}: ${reason}`);
        else
            throw new Error(`${SERVERS[id].name} cannot run here: ${reason}. Pass --skip-unavailable to leave it out.`);
    }
    if (servers.length === 0) throw new Error('no server can run on this host');

    const scenarios: ScenarioDescription[] = scenarioIds.map((id) => ({
        id,
        worlds: Object.fromEntries(servers.map((server) => [server, SERVERS[server].world(id)])),
        bots: positiveInteger(id === 'flat' ? values['flat-bots'] : values['terrain-bots'], `${id}-bots`),
        viewDistance,
        simulationDistance: SIMULATION_DISTANCE,
        steps: positiveInteger(values.steps, 'steps'),
        stepBlocks: positiveInteger(values['step-blocks'], 'step-blocks'),
        // Feet on the grass of a classic flat world, which all three build from y -64 up. Above
        // the highest terrain otherwise; creative mode keeps a falling bot alive.
        teleportY: id === 'flat' ? -60 : 200,
        idleMs: positiveInteger(values.idle, 'idle') * 1000,
        stepTimeoutMs: id === 'flat' ? 60_000 : 300_000
    }));

    const startedAt = new Date();
    const out = path.resolve(
        values.out ?? path.join(REPO, 'docs', 'research', 'benchmarks', resultsDirName(startedAt), 'results.json')
    );
    const workDir = path.resolve(values.work ?? mkdtempSync(path.join(tmpdir(), 'jsp-server-benchmark-')));
    mkdirSync(path.dirname(out), { recursive: true });
    log(`server data in ${workDir}, results in ${path.relative(process.cwd(), out)}`);

    const descriptions: Partial<Record<ServerId, ServerDescription>> = {};
    for (const id of servers) {
        const { version, source } = await SERVERS[id].describe();
        // The command and settings fill in as the runs prepare each scenario.
        descriptions[id] = {
            name: SERVERS[id].name,
            transport: SERVERS[id].transport,
            version,
            source,
            command: '',
            settings: []
        };
    }

    const inputs = readInputs(REPO);
    const logicalCpus = availableParallelism();
    const limit = quietLoadLimit(logicalCpus);
    const roundResults: RoundResult[] = [];
    const runs: RunResult[] = [];
    const write = () => {
        const results: BenchmarkResults = {
            schema: RESULTS_SCHEMA,
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
            command: commandLine(),
            environment: {
                os: osName(),
                kernel: release(),
                arch: process.arch,
                cpuModel: cpus()[0]?.model.trim() ?? 'unknown',
                logicalCpus,
                memoryBytes: totalmem(),
                node: process.version,
                ci: ciRun()
            },
            protocol: { version: PROTOCOL_VERSION, minecraftVersion: pin.minecraftVersion },
            inputs,
            servers: descriptions,
            scenarios,
            quietLoadLimit: limit,
            harness: { cooldownMaxMs: cooldownMs, settleQuietMs: SETTLE_QUIET_MS, memorySampleMs: MEMORY_SAMPLE_MS },
            rounds: roundResults,
            runs
        };
        // Written beside the file and renamed over it, so an interrupted write never loses the runs
        // an earlier write saved.
        const partial = `${out}.partial`;
        writeFileSync(partial, `${JSON.stringify(results, null, 4)}\n`);
        renameSync(partial, out);
    };

    // A server runs in a process group of its own and does not get the terminal's signal, so an
    // interrupted benchmark stops its server and bots itself, and keeps the results written so far.
    const interrupt = (signal: NodeJS.Signals) => {
        log(`${signal}; stopping the server in progress`);
        void stopActiveRuns().finally(() => process.exit(130));
    };
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);

    for (let round = 0; round < rounds; round++) {
        const order = roundOrder(servers, round);
        log(`round ${round + 1} of ${rounds}: ${order.join(', ')}`);
        let roundStart: RoundResult['load']['start'] | undefined;
        for (const scenario of scenarios) {
            for (const [position, id] of order.entries()) {
                log(`${scenario.id} on ${SERVERS[id].name}`);
                const run = await runOnce({
                    server: SERVERS[id],
                    scenario,
                    round,
                    position,
                    workDir,
                    seed,
                    port,
                    readyTimeoutMs: 600_000,
                    loginTimeoutMs: 60_000,
                    stopTimeoutMs: 120_000,
                    quietLoadLimit: limit,
                    cooldownMs,
                    log: (line) => log(`  ${SERVERS[id].name}: ${line}`),
                    onPrepared: (prepared) => {
                        const description = descriptions[id]!;
                        descriptions[id] = {
                            ...description,
                            command: prepared.command,
                            settings: mergeSettings(description.settings, prepared.settings, scenario.id)
                        };
                    }
                });
                roundStart ??= run.load.before;
                runs.push(run);
                write();
                // Fails fast: the runs after a failed JSPrismarine run would spend the rest of the
                // job measuring a server whose figures are not published.
                const [failed] = failedJspRuns([run]);
                if (failed !== undefined) {
                    log(`not measured: ${failed}; stopping the benchmark`);
                    process.exitCode = 1;
                    return;
                }
            }
        }
        // Measured after the last run's load has had the same chance to decay as before a run.
        const end = await coolDown(limit, cooldownMs);
        const start = roundStart ?? end;
        roundResults.push({
            round,
            order,
            load: { start, end },
            quiet: isQuietLoad(start[0], limit) && isQuietLoad(end[0], limit)
        });
        write();
    }
    log(`done; load ${readLoad().join(' ')}; results in ${out}`);
};

try {
    await main();
} catch (error: unknown) {
    log(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
