/**
 * Measures importing the server entry through TSX and Node's native type stripping.
 *
 * Both runs use `--help`, so the server imports its source graph without opening a world or
 * listening on a network socket. A native syntax blocker is reported as a benchmark result.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const serverDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const samplesPerMode = 3;

/** Runs one server-entry import and captures its timing record or startup failure. */
const run = (mode, preload) => {
    const startedAt = performance.now();
    const result = spawnSync(
        process.execPath,
        ['--import', preload, './scripts/native-typescript-entry.mjs', '--help'],
        {
            cwd: serverDirectory,
            encoding: 'utf8',
            maxBuffer: 16 * 1024 * 1024,
            timeout: 120_000
        }
    );
    const elapsedMs = performance.now() - startedAt;
    const finalLine = result.stdout?.trim().split(/\r?\n/u).at(-1);
    let childResult;
    try {
        childResult = finalLine === undefined ? undefined : JSON.parse(finalLine);
    } catch {
        childResult = undefined;
    }

    return {
        mode,
        exitCode: result.status,
        elapsedMs: childResult?.elapsedMs ?? elapsedMs,
        cpuMs: childResult?.cpuMs ?? null,
        error: childResult?.error ?? (result.error === undefined ? null : result.error.message),
        diagnostic: childResult?.diagnostic ?? (result.stderr?.trim().slice(-1600) || null)
    };
};

/** Returns the middle measurement, preserving fractional milliseconds. */
const median = (values) => {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.floor(sorted.length / 2)];
};

const samples = { tsx: [], native: [] };
for (let index = 0; index < samplesPerMode; index += 1) {
    const order = index % 2 === 0 ? ['tsx', 'native'] : ['native', 'tsx'];
    for (const mode of order) {
        const result =
            mode === 'tsx'
                ? run('tsx', 'tsx')
                : run('node-type-stripping', '../../scripts/native-typescript-loader.mjs');
        samples[mode].push(result);
    }
}

const reports = [
    { mode: 'tsx', samples: samples.tsx },
    { mode: 'node-type-stripping', samples: samples.native }
].map((report) => ({
    ...report,
    medianElapsedMs: median(report.samples.map((sample) => sample.elapsedMs)),
    medianCpuMs: median(report.samples.map((sample) => sample.cpuMs).filter((value) => value !== null)),
    completed: report.samples.every((sample) => sample.exitCode === 0)
}));
process.stdout.write(
    `${JSON.stringify(
        {
            node: process.version,
            workload: 'import packages/server/src/Server.ts and handle --help',
            samplesPerMode,
            runs: reports,
            nativeRunCompleted: reports[1]?.completed === true
        },
        null,
        2
    )}\n`
);
