/**
 * Runs repeatable, warmed benchmarks and compares their output digests and timing distributions.
 *
 * Examples:
 *   pnpm --filter @jsprismarine/prismarine run bench:trends -- --write /tmp/benchmarks.json
 *   pnpm --filter @jsprismarine/prismarine run bench:trends -- --baseline /tmp/benchmarks.json
 *   pnpm --filter @jsprismarine/prismarine run bench:trends -- --scenarios network,items
 *
 * Timing changes are reported but never gate. A digest mismatch or failed benchmark exits nonzero.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const benchmarkDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = resolve(benchmarkDirectory, '..');
const rootDirectory = resolve(packageDirectory, '../..');
const scenarios = {
    chunks: {
        description: 'overworld chunk generation',
        args: ['--import', 'tsx', 'benchmarks/chunkGeneration.ts', '0', '16', 'full', '8', '2', '7']
    },
    network: {
        description: 'proximity block-change flush',
        args: ['--import', 'tsx', 'benchmarks/blockProximity.bench.ts', '256', '25000', '7']
    },
    items: {
        description: 'dropped-item pickup search',
        args: ['--import', 'tsx', 'benchmarks/entityPickup.bench.ts', '10000', '400', '7']
    },
    storage: {
        description: 'persistent block storage codec',
        args: ['--import', 'tsx', 'benchmarks/blockStorage.bench.ts', '50']
    },
    'feature-worker': {
        description: 'feature worker terrain copies',
        args: ['--expose-gc', '--import', 'tsx', 'benchmarks/featureWorker.bench.ts', '7']
    },
    'breeding-navigation': {
        description: 'many-pair breeding route replanning',
        args: ['benchmarks/run.mjs', 'benchmarks/breedingNavigation.bench.ts', '100', '60', '7']
    },
    startup: {
        description: 'server startup by runtime and compile-cache state',
        args: ['--import', 'tsx', 'benchmarks/compileCache.ts', '--startup-only', '3']
    }
};

const argv = process.argv.slice(2).filter((argument) => argument !== '--');
let selectedScenarios = ['chunks', 'network'];
let baselinePath;
let writePath;

for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--help') {
        process.stdout.write(
            'Usage: node benchmarks/trends.mjs [--scenarios chunks,network] [--baseline file] [--write file]\n'
        );
        process.exit(0);
    }
    if (argument === '--scenarios' || argument === '--baseline' || argument === '--write') {
        const value = argv[index + 1];
        if (value === undefined || value.startsWith('--')) throw new Error(`${argument} requires a value`);
        index++;
        if (argument === '--scenarios') selectedScenarios = value.split(',').map((scenario) => scenario.trim());
        else if (argument === '--baseline') baselinePath = resolve(value);
        else writePath = resolve(value);
        continue;
    }
    throw new Error(`Unknown argument ${argument}`);
}

if (selectedScenarios.length === 0) throw new Error('Select at least one benchmark scenario');
for (const scenario of selectedScenarios) {
    if (!Object.hasOwn(scenarios, scenario))
        throw new Error(`Unknown scenario ${scenario}; choose ${Object.keys(scenarios).join(', ')}`);
}

const readBaseline = () => {
    if (baselinePath === undefined) return undefined;
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    if (baseline.version !== 1 || !Array.isArray(baseline.results)) {
        throw new Error(`${baselinePath} is not a benchmark trend baseline (expected version 1 and results)`);
    }
    return baseline;
};

const runScenario = (scenario) => {
    const command = [process.execPath, ...scenarios[scenario].args];
    const result = spawnSync(process.execPath, scenarios[scenario].args, {
        cwd: packageDirectory,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024
    });
    if (result.error !== undefined || result.status !== 0) {
        return {
            scenario,
            description: scenarios[scenario].description,
            command,
            error: result.error?.message || result.stderr.trim() || `exit status ${result.status}`,
            exitCode: result.status,
            signal: result.signal
        };
    }

    const rows = result.stdout
        .split(/\r?\n/u)
        .filter((line) => line.trimStart().startsWith('{'))
        .map((line) => JSON.parse(line));
    if (rows.length === 0 || rows.some((row) => typeof row.benchmark !== 'string')) {
        return {
            scenario,
            description: scenarios[scenario].description,
            command,
            error: 'Benchmark exited successfully without a JSON report containing a benchmark name',
            exitCode: 0,
            stdout: result.stdout.trim(),
            stderr: result.stderr.trim()
        };
    }

    return { scenario, description: scenarios[scenario].description, command, results: rows };
};

const collectMetrics = (value, path = '', metrics = { digests: {}, p50s: {} }) => {
    if (value === null || typeof value !== 'object') return metrics;
    for (const [key, member] of Object.entries(value)) {
        const memberPath = path === '' ? key : `${path}.${key}`;
        if ((key === 'outputDigest' || key === 'workloadDigest') && typeof member === 'string') {
            metrics.digests[path] = member;
        }
        if (
            (key === 'distributionMs' || key.endsWith('DistributionMs')) &&
            member !== null &&
            typeof member === 'object'
        ) {
            if (typeof member.p50 === 'number') metrics.p50s[memberPath] = member.p50;
        }
        collectMetrics(member, memberPath, metrics);
    }
    return metrics;
};

const baseline = readBaseline();
const results = selectedScenarios.map(runScenario);
let failed = results.some((result) => result.error !== undefined);

if (baseline !== undefined) {
    for (const result of results) {
        if (result.results === undefined) continue;
        result.comparisons = result.results.map((current) => {
            const previous = baseline.results.find((row) => row.benchmark === current.benchmark);
            if (previous === undefined) return { benchmark: current.benchmark, status: 'no baseline' };

            const currentMetrics = collectMetrics(current);
            const baselineMetrics = collectMetrics(previous);
            const digestMatches = JSON.stringify(currentMetrics.digests) === JSON.stringify(baselineMetrics.digests);
            if (!digestMatches) failed = true;

            const timingChanges = Object.fromEntries(
                Object.entries(currentMetrics.p50s).map(([name, p50]) => {
                    const baselineP50 = baselineMetrics.p50s[name];
                    return [
                        name,
                        baselineP50 === undefined
                            ? { status: 'no baseline' }
                            : {
                                  baselineP50Ms: baselineP50,
                                  currentP50Ms: p50,
                                  changePercent: ((p50 - baselineP50) / baselineP50) * 100
                              }
                    ];
                })
            );
            return {
                benchmark: current.benchmark,
                status: digestMatches ? 'digest matches' : 'digest mismatch',
                timingChanges
            };
        });
    }
}

const report = {
    version: 1,
    host: {
        node: process.version,
        platform: `${os.platform()}-${os.arch()}`,
        cpu: os.cpus()[0]?.model ?? 'unknown',
        availableParallelism: os.availableParallelism()
    },
    baseline: baselinePath,
    results
};

if (writePath !== undefined) {
    if (failed) {
        failed = true;
    } else {
        mkdirSync(dirname(writePath), { recursive: true });
        const storedBaseline = {
            version: 1,
            capturedAt: new Date().toISOString(),
            host: report.host,
            results: results.flatMap((result) => result.results ?? [])
        };
        writeFileSync(writePath, `${JSON.stringify(storedBaseline, null, 2)}\n`);
    }
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failed) process.exitCode = 1;
