/**
 * Runs the terrain fill benchmark, one process per arm per round, interleaved.
 *
 * Each process warms up and reports every timed repetition. The runner checks that every arm
 * produces the same block digest and summarizes pooled timings with a median and range.
 *
 * Run `pnpm --filter @jsprismarine/worldgen run bench`. Pass a process-round count as the first
 * argument; the default is 5.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { cpus, loadavg, platform, release, totalmem, tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';

const ARMS = ['fill', 'router', 'density', 'generated', 'skip'] as const;
const OUTPUT_ARMS = ['fill', 'router', 'generated', 'skip'] as const;

interface ArmResult {
    readonly arm: (typeof ARMS)[number];
    readonly seed: string;
    readonly chunkCoordinates: readonly (readonly [number, number])[];
    readonly warmups: number;
    readonly repetitions: number;
    readonly measurementsPerChunk: readonly number[];
    readonly checksum: number;
    readonly digest: string;
    readonly octaveSamplesPerChunk: number;
    readonly cellsPerChunk: number;
    readonly compileMilliseconds: number;
    readonly compileHeapBytes: number;
    readonly generatedFunctionCount: number;
    readonly generatedFunctionBytes: number;
    readonly closureFallbackCount: number;
    readonly skippedCellsPerChunk: number;
    readonly skippedBlocksPerChunk: number;
    readonly densityCallsSkippedPerChunk: number;
    readonly aquiferCallsSkippedPerChunk: number;
}

const median = (values: readonly number[]): number => {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    const lower = sorted[middle - 1];
    const upper = sorted[middle];
    if (upper === undefined) throw new Error('Cannot calculate a median from an empty sample');
    if (sorted.length % 2 !== 0) return upper;
    if (lower === undefined) throw new Error('Cannot calculate a median from an incomplete sample');
    return (lower + upper) / 2;
};

const assertStable = (arm: string, results: readonly ArmResult[]): void => {
    const digests = new Set(results.map((result) => result.digest));
    const checksums = new Set(results.map((result) => result.checksum));
    if (digests.size !== 1 || checksums.size !== 1) {
        throw new Error(
            `${arm} output changed between process rounds: digests ${[...digests]}, checksums ${[...checksums]}`
        );
    }
};

const here = path.dirname(fileURLToPath(import.meta.url));
const rounds = Number.parseInt(process.argv[2] ?? '5', 10);
if (!Number.isInteger(rounds) || rounds < 1) throw new RangeError('Pass a positive process-round count');
const work = mkdtempSync(path.join(tmpdir(), 'jsp-worldgen-bench-'));

try {
    const bundle = await rolldown({ input: path.join(here, 'chunkFill.ts'), platform: 'node' });
    const entry = path.join(work, 'chunkFill.mjs');
    await bundle.write({ file: entry, format: 'esm', codeSplitting: false });
    await bundle.close();

    const resultsByArm = new Map<string, ArmResult[]>(ARMS.map((arm) => [arm, []]));
    const loadBefore = loadavg();
    const benchmarkStarted = performance.now();
    for (let round = 0; round < rounds; round++) {
        for (let offset = 0; offset < ARMS.length; offset++) {
            const arm = ARMS[(round + offset) % ARMS.length];
            if (arm === undefined) throw new Error(`No benchmark arm at offset ${offset}`);
            const output = execFileSync(process.execPath, ['--expose-gc', entry, arm], { encoding: 'utf8' });
            // The child process emits this JSON shape; validating the values below catches drift.
            const result: ArmResult = JSON.parse(output);
            if (result.arm !== arm || result.measurementsPerChunk.length !== result.repetitions) {
                throw new Error(`Unexpected benchmark result for ${arm}`);
            }
            const results = resultsByArm.get(arm);
            if (!results) throw new Error(`No result list for ${arm}`);
            results.push(result);
            process.stderr.write(
                `round ${round + 1} ${arm}: ${median(result.measurementsPerChunk).toFixed(2)} ms/chunk median\n`
            );
        }
    }
    const elapsedMilliseconds = performance.now() - benchmarkStarted;
    const loadAfter = loadavg();

    for (const [arm, results] of resultsByArm) assertStable(arm, results);
    const reference = resultsByArm.get('fill')?.[0];
    if (!reference) throw new Error('The closure fill arm produced no result');
    for (const arm of OUTPUT_ARMS) {
        const result = resultsByArm.get(arm)?.[0];
        if (!result) throw new Error(`The ${arm} arm produced no result`);
        if (result.digest !== reference.digest || result.checksum !== reference.checksum) {
            throw new Error(
                `Output digest mismatch: fill=${reference.digest}/${reference.checksum}, ` +
                    `${arm}=${result.digest}/${result.checksum}`
            );
        }
    }

    const first = resultsByArm.get('fill')?.[0];
    if (!first) throw new Error('The benchmark did not produce its configuration');
    for (const result of [...resultsByArm.values()].flat()) {
        if (
            result.seed !== first.seed ||
            JSON.stringify(result.chunkCoordinates) !== JSON.stringify(first.chunkCoordinates) ||
            result.warmups !== first.warmups ||
            result.repetitions !== first.repetitions
        ) {
            throw new Error(`Benchmark configuration changed in the ${result.arm} arm`);
        }
    }

    const cpuList = cpus();
    const cpuModel = cpuList[0]?.model ?? 'unknown CPU';
    const quietLoadLimit = Math.max(1, cpuList.length / 4);
    const quietMachine =
        (loadBefore[0] ?? Number.POSITIVE_INFINITY) <= quietLoadLimit &&
        (loadAfter[0] ?? Number.POSITIVE_INFINITY) <= quietLoadLimit;
    process.stdout.write(
        `Environment: Node ${process.version}, V8 ${process.versions.v8}, ${platform()} ${release()} ${process.arch}, ` +
            `${cpuModel}, ${cpuList.length} logical CPUs, ${Math.round(totalmem() / 1024 ** 3)} GiB RAM\n`
    );
    process.stdout.write(
        `Load averages (1m/5m/15m): start ${loadBefore.map((value) => value.toFixed(2)).join('/')}, ` +
            `end ${loadAfter.map((value) => value.toFixed(2)).join('/')}\n`
    );
    process.stdout.write(
        `Quiet-run criterion: 1m load at start and end <= ${quietLoadLimit.toFixed(2)} ` +
            `(${quietMachine ? 'met' : 'not met'})\n`
    );
    process.stdout.write(
        `Configuration: seed ${first.seed}, chunks ${JSON.stringify(first.chunkCoordinates)}, ` +
            `${first.warmups} warmups and ${first.repetitions} measurements per process, ` +
            `${rounds} fresh-process rounds, ${elapsedMilliseconds.toFixed(0)} ms total\n`
    );
    process.stdout.write(`\nMedian chunk-fill time and full sample range, milliseconds per chunk\n`);
    for (const arm of ARMS) {
        const results = resultsByArm.get(arm);
        if (!results || results.length === 0) continue;
        const firstResult = results[0];
        if (!firstResult) continue;
        const samples = results.flatMap((result) => result.measurementsPerChunk);
        const minimum = Math.min(...samples);
        const maximum = Math.max(...samples);
        const compileMilliseconds = median(results.map((result) => result.compileMilliseconds));
        const compileHeapBytes = median(results.map((result) => result.compileHeapBytes));
        process.stdout.write(
            `  ${arm.padEnd(10)} ${median(samples).toFixed(2).padStart(8)} ms/chunk ` +
                `[${minimum.toFixed(2)}, ${maximum.toFixed(2)}], ${firstResult.cellsPerChunk} cells/chunk, ` +
                `${firstResult.octaveSamplesPerChunk} octave samples/chunk, digest ${firstResult.digest}\n`
        );
        if (firstResult.skippedCellsPerChunk > 0) {
            process.stdout.write(
                `  skipped ${firstResult.skippedCellsPerChunk} cells and ${firstResult.skippedBlocksPerChunk} blocks/chunk, ` +
                    `${firstResult.densityCallsSkippedPerChunk} density calls, ` +
                    `${firstResult.aquiferCallsSkippedPerChunk} aquifer calls\n`
            );
        }
        if (arm !== 'density') {
            process.stdout.write(
                `  compile ${compileMilliseconds.toFixed(2)} ms median, ${compileHeapBytes.toFixed(0)} heap bytes median, ` +
                    `${firstResult.generatedFunctionCount} functions, ${firstResult.generatedFunctionBytes} source bytes, ` +
                    `${firstResult.closureFallbackCount} closure fallbacks\n`
            );
        }
    }

    process.stdout.write(`\nDigest verification: PASS, fill/router/generated/skip all match ${reference.digest}\n`);
    const checksums = ARMS.map((arm) => `${arm} ${resultsByArm.get(arm)?.[0]?.checksum ?? 'missing'}`).join(', ');
    process.stdout.write(`Checksums: ${checksums}\n`);
} finally {
    rmSync(work, { recursive: true, force: true });
}
