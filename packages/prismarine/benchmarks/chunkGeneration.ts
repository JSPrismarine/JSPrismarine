/**
 * How long the overworld generator takes per chunk, and where the time goes.
 *
 * Run `pnpm --filter @jsprismarine/prismarine run bench:chunks`. Arguments are worker count,
 * chunk count, arm, region size, steal threshold, measured sample count, and climate tree mode;
 * `0` workers runs the whole thing on this thread, which is the figure every other arm is worth
 * comparing against.
 *
 * The chunks are a contiguous block rather than scattered positions, because that is the shape
 * a start region and a player's view distance both have: neighbors are shared, and a run over
 * scattered chunks would charge each one for a neighborhood nothing else reuses.
 *
 * This needs Mojang's world generation data, the same as the generator does. Without it the
 * run reports what is missing and stops.
 */
import { createHash } from 'node:crypto';
import os, { availableParallelism } from 'node:os';

import {
    DataDrivenGenerator,
    defaultChunkPipeline,
    defaultTerrainPipeline
} from '@jsprismarine/prismarine/world/generators/datadriven/DataDrivenGenerator';
import { findJavaTemplateSource } from '@jsprismarine/prismarine/world/generators/datadriven/javaStructureTemplates';
import {
    cacheRoot,
    findJavaWorldgenSources,
    loadJavaWorldgenRegistries
} from '@jsprismarine/prismarine/world/generators/datadriven/javaWorldgenData';

// pnpm may keep the `--` script-argument separator in argv; remove it before parsing options.
const args = process.argv[2] === '--' ? process.argv.slice(3) : process.argv.slice(2);
const workers = Number.parseInt(args[0] ?? '0', 10);
const chunks = Number.parseInt(args[1] ?? '16', 10);
/**
 * Which half of the ladder to run, so a change can be charged to one of them.
 *
 * `terrain` is the noise fill alone, `structures` adds the layout pass that pushes terrain
 * around, and the default runs the decoration pass and the Bedrock translation as well. `stages`
 * runs the shared terrain and feature workers. `climate` runs terrain through the shared status
 * pool with decoration, structures, and carvers off, and reports worker heap and first-task
 * costs.
 */
const arm = args[2] ?? 'full';
/** Region size and steal threshold, for sweeping the sharded pool's two knobs. */
const regionChunks = Number.parseInt(args[3] ?? '8', 10);
const stealAfter = Number.parseInt(args[4] ?? '2', 10);
const sampleCount = Number.parseInt(args[5] ?? '7', 10);
const climateTreeMode = args[6] ?? 'shared';
const warmups = 2;
const seed = 1234n;

if (![workers, chunks, regionChunks, stealAfter, sampleCount].every(Number.isSafeInteger)) {
    throw new RangeError('Worker, chunk, region, steal, and sample counts must be safe integers');
}
if (workers < 0 || chunks < 1 || regionChunks < 1 || stealAfter < 1 || sampleCount < 1) {
    throw new RangeError('Workers must be nonnegative; chunks, region, steal, and samples must be positive');
}
if (climateTreeMode !== 'shared' && climateTreeMode !== 'local') {
    throw new RangeError('Climate tree mode must be shared or local');
}

const sources = findJavaWorldgenSources();
if (sources === undefined) {
    process.stderr.write(
        'No Java world generation data. Run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` ' +
            'and `pnpm --filter @jsprismarine/bedrock-data run datagen:java` first.\n'
    );
    process.exit(1);
}

const startedLoading = performance.now();
const registries = loadJavaWorldgenRegistries(sources);
const templates = findJavaTemplateSource(cacheRoot(), registries.processorLists);
const loaded = performance.now() - startedLoading;

let workerPoolUnavailable = false;
const poolUnavailable = (reason: string): void => {
    workerPoolUnavailable = true;
    process.stderr.write(`no worker pool: ${reason}\n`);
};

let generatorSetupMs = 0;
const createGenerator = (
    workerHeapStats?: SharedArrayBuffer,
    workerStartupStats?: SharedArrayBuffer
): DataDrivenGenerator => {
    const started = performance.now();
    const generator = new DataDrivenGenerator({
        registries,
        templates,
        ...(climateTreeMode === 'local' ? { sharedClimateTrees: new Map() } : {}),
        ...(arm === 'terrain' || arm === 'climate' ? { decorate: false, structures: false } : {}),
        ...(arm === 'climate' ? { carve: false } : {}),
        ...(arm === 'structures' ? { decorate: false } : {}),
        ...(workers > 0 && arm === 'chunks'
            ? {
                  chunks: {
                      pipeline: defaultChunkPipeline(),
                      workers,
                      regionChunks,
                      stealAfter,
                      onUnavailable: poolUnavailable
                  }
              }
            : {}),
        ...(workers > 0 && (arm === 'stages' || arm === 'climate')
            ? {
                  stages: {
                      pipeline: defaultChunkPipeline(),
                      workers,
                      javaTemplates: arm === 'stages',
                      ...(workerHeapStats === undefined ? {} : { workerHeapStats }),
                      ...(workerStartupStats === undefined ? {} : { workerStartupStats }),
                      onUnavailable: poolUnavailable
                  }
              }
            : {}),
        ...(workers > 0 && arm !== 'chunks' && arm !== 'stages' && arm !== 'climate'
            ? {
                  terrain: {
                      pipeline: defaultTerrainPipeline(),
                      workers,
                      onUnavailable: poolUnavailable
                  }
              }
            : {})
    });
    // Includes the one-time shared climate tree build and pool setup. First-task timings below
    // include worker module import, pipeline construction, and that worker's first generated task.
    generatorSetupMs = performance.now() - started;
    return generator;
};

/** A square of chunks, side by side, the way a start region fills. */
const side = Math.ceil(Math.sqrt(chunks));
const positions = Array.from({ length: chunks }, (_unused, index) => [index % side, Math.trunc(index / side)] as const);

interface Run {
    readonly ms: number;
    readonly generatorSetupMs: number;
    readonly processCpuMs: number;
    readonly mainHeapUsedBytes: number;
    readonly rssBytes: number;
    readonly outputDigest: string;
    readonly workerHeapUsedBytes: readonly number[];
    readonly workerFirstTaskWallUs: readonly number[];
    readonly workerFirstTaskCpuUs: readonly number[];
    readonly workerFirstTaskHeapBytes: readonly number[];
    readonly blockIndexBytes: number;
}

const run = async (): Promise<Run> => {
    const workerHeapStats =
        workers > 0 && (arm === 'stages' || arm === 'climate')
            ? new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * (workers + 1))
            : undefined;
    const workerStartupStats =
        workers > 0 && (arm === 'stages' || arm === 'climate')
            ? new SharedArrayBuffer(BigInt64Array.BYTES_PER_ELEMENT * (workers * 3 + 1))
            : undefined;
    // Each generator retains finished chunks by coordinate, so a fresh instance keeps every
    // warmup and sample on the generation path instead of measuring a cache hit.
    const generator = createGenerator(workerHeapStats, workerStartupStats);
    const started = performance.now();
    const cpuStarted = process.cpuUsage();
    try {
        // All at once, because that is how the preload and the chunk scheduler ask: the depth is
        // what lets a pool have more than one worker busy.
        const generated = await Promise.all(
            positions.map(async ([x, z]) => ({ x, z, chunk: await generator.generateChunk(x, z, seed) }))
        );
        const elapsed = performance.now() - started;
        const cpu = process.cpuUsage(cpuStarted);
        const memory = process.memoryUsage();
        const output = createHash('sha256');
        let blockIndexBytes = 0;
        for (const { x, z, chunk } of generated) {
            output.update(`${x},${z}\0`);
            output.update(chunk.networkSerialize());
            for (const [, subChunk] of chunk.getSubChunkEntries()) {
                for (const storage of subChunk.getStorages()) {
                    // Inspect the private palette buffer here without widening the runtime API.
                    const indices = Reflect.get(storage, 'blocks');
                    if (!(indices instanceof Uint8Array || indices instanceof Uint16Array)) {
                        throw new Error('BlockStorage has an unsupported index buffer');
                    }
                    blockIndexBytes += indices.byteLength;
                }
            }
        }

        const stats = workerHeapStats === undefined ? undefined : new Int32Array(workerHeapStats);
        const workerCount = stats === undefined ? 0 : Atomics.load(stats, 0);
        const workerHeapUsedBytes =
            stats === undefined
                ? []
                : Array.from({ length: workerCount }, (_unused, index) => Atomics.load(stats, index + 1));
        const startupStats = workerStartupStats === undefined ? undefined : new BigInt64Array(workerStartupStats);
        const startupWorkerCount = startupStats === undefined ? 0 : Number(Atomics.load(startupStats, 0));
        const workerFirstTaskWallUs =
            startupStats === undefined
                ? []
                : Array.from({ length: startupWorkerCount }, (_unused, index) =>
                      Number(Atomics.load(startupStats, 1 + index * 3))
                  );
        const workerFirstTaskCpuUs =
            startupStats === undefined
                ? []
                : Array.from({ length: startupWorkerCount }, (_unused, index) =>
                      Number(Atomics.load(startupStats, 2 + index * 3))
                  );
        const workerFirstTaskHeapBytes =
            startupStats === undefined
                ? []
                : Array.from({ length: startupWorkerCount }, (_unused, index) =>
                      Number(Atomics.load(startupStats, 3 + index * 3))
                  );

        return {
            ms: elapsed,
            generatorSetupMs,
            processCpuMs: (cpu.user + cpu.system) / 1000,
            mainHeapUsedBytes: memory.heapUsed,
            rssBytes: memory.rss,
            outputDigest: output.digest('hex'),
            workerHeapUsedBytes,
            workerFirstTaskWallUs,
            workerFirstTaskCpuUs,
            workerFirstTaskHeapBytes,
            blockIndexBytes
        };
    } finally {
        generator.stopGenerating();
    }
};

const percentile = (sorted: readonly number[], fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)] ?? 0;

for (let warmup = 0; warmup < warmups; warmup++) await run();
const cpuBeforeSamples = process.cpuUsage();
const runs: Run[] = [];
// Do not overlap samples: independent generators still compete for CPU and distort each sample.
for (let sample = 0; sample < sampleCount; sample++) runs.push(await run());
const cpuForSamples = process.cpuUsage(cpuBeforeSamples);
const times = runs.map(({ ms }) => ms).sort((left, right) => left - right);
const digests = new Set(runs.map(({ outputDigest }) => outputDigest));
if (digests.size !== 1) throw new Error('Chunk-generation output digest changed between samples');

const p50 = percentile(times, 0.5);
process.stdout.write(
    `${JSON.stringify({
        benchmark: 'chunk-generation',
        seed: seed.toString(),
        node: process.version,
        platform: `${os.platform()}-${os.arch()}`,
        cpu: os.cpus()[0]?.model ?? 'unknown',
        availableParallelism: availableParallelism(),
        workerCount: workers > 0 && !workerPoolUnavailable ? workers : 0,
        requestedWorkerCount: workers,
        chunks,
        arm,
        climateTreeMode,
        regionChunks,
        stealAfter,
        warmups,
        samples: sampleCount,
        generatorSetupMsByRun: runs.map(({ generatorSetupMs }) => generatorSetupMs),
        registriesLoadedMs: loaded,
        distributionMs: {
            min: times[0] ?? 0,
            p50,
            p95: percentile(times, 0.95),
            max: times.at(-1) ?? 0
        },
        processCpuMsForSamples: (cpuForSamples.user + cpuForSamples.system) / 1000,
        throughputChunksPerSecond: (chunks / p50) * 1000,
        processCpuMsByRun: runs.map(({ processCpuMs }) => processCpuMs),
        mainHeapUsedBytesByRun: runs.map(({ mainHeapUsedBytes }) => mainHeapUsedBytes),
        rssBytesByRun: runs.map(({ rssBytes }) => rssBytes),
        workerHeapUsedBytesByRun: runs.map(({ workerHeapUsedBytes }) => workerHeapUsedBytes),
        workerFirstTaskWallUsByRun: runs.map(({ workerFirstTaskWallUs }) => workerFirstTaskWallUs),
        workerFirstTaskCpuUsByRun: runs.map(({ workerFirstTaskCpuUs }) => workerFirstTaskCpuUs),
        workerFirstTaskHeapBytesByRun: runs.map(({ workerFirstTaskHeapBytes }) => workerFirstTaskHeapBytes),
        blockIndexBytes: runs[0]?.blockIndexBytes,
        blockIndexBytesPerChunk: (runs[0]?.blockIndexBytes ?? 0) / chunks,
        outputDigest: runs[0]?.outputDigest
    })}\n`
);
