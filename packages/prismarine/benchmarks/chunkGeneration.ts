/**
 * How long the overworld generator takes per chunk, and where the time goes.
 *
 * Run `pnpm --filter @jsprismarine/prismarine run bench:chunks`. Arguments are worker count,
 * chunk count, arm, region size, steal threshold, measured sample count, climate-table mode,
 * optional heap-snapshot directory, terrain-tile mode, shared-store size in MiB, and warmup
 * count. `0` workers runs the whole thing on this thread, which is the
 * figure every other arm is worth comparing against.
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

import type { GenerationStatsSnapshot } from '@jsprismarine/chunkgen';

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
import { shareClimateTables } from '../src/world/generators/datadriven/sharedClimateTables';
import { SharedTerrainTileStore } from '../src/world/generators/datadriven/SharedTerrainTileStore';
import { percentile } from './percentile';

// pnpm may keep the `--` script-argument separator in argv; remove it before parsing options.
const args = process.argv[2] === '--' ? process.argv.slice(3) : process.argv.slice(2);
const workers = Number.parseInt(args[0] ?? '0', 10);
const chunks = Number.parseInt(args[1] ?? '16', 10);
/**
 * Which half of the ladder to run, so a change can be charged to one of them.
 *
 * `terrain` is the noise fill alone, `structures` adds the layout pass that pushes terrain
 * around, and the default runs the decoration pass and the Bedrock translation as well. `stages`
 * runs the server's shared terrain and feature workers and reports their heap usage.
 */
const arm = args[2] ?? 'full';
/** Region size and steal threshold, for sweeping the sharded pool's two knobs. */
const regionChunks = Number.parseInt(args[3] ?? '8', 10);
const stealAfter = Number.parseInt(args[4] ?? '2', 10);
const sampleCount = Number.parseInt(args[5] ?? '7', 10);
const climateTables = args[6] ?? 'shared';
const workerHeapSnapshotDirectory = args[7] === '-' ? undefined : args[7];
const terrainTileMode = args[8] ?? 'local';
const terrainTileStoreMiB = Number.parseInt(args[9] ?? '32', 10);
const warmups = Number.parseInt(args[10] ?? '2', 10);
const seed = 1234n;

if (![workers, chunks, regionChunks, stealAfter, sampleCount, warmups].every(Number.isSafeInteger)) {
    throw new RangeError('Worker, chunk, region, steal, sample, and warmup counts must be safe integers');
}
if (workers < 0 || chunks < 1 || regionChunks < 1 || stealAfter < 1 || sampleCount < 1 || warmups < 0) {
    throw new RangeError(
        'Workers and warmups must be nonnegative; chunks, region, steal, and samples must be positive'
    );
}
if (climateTables !== 'shared' && climateTables !== 'local') {
    throw new RangeError('Climate table mode must be shared or local');
}
if (terrainTileMode !== 'shared' && terrainTileMode !== 'local') {
    throw new RangeError('Terrain tile mode must be shared or local');
}
if (!Number.isSafeInteger(terrainTileStoreMiB) || terrainTileStoreMiB < 1) {
    throw new RangeError('Terrain tile store size must be a positive integer number of MiB');
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
const climateTableStarted = performance.now();
const sharedClimateParameters = climateTables === 'shared' ? shareClimateTables(registries.biomeParameters) : undefined;
const climateTableInitializationMs = performance.now() - climateTableStarted;
const effectiveClimateTables = sharedClimateParameters === undefined ? 'local' : 'shared';
const sharedClimateTableBytes =
    sharedClimateParameters === undefined
        ? 0
        : Array.from(sharedClimateParameters.values()).reduce((total, table) => total + table.byteLength, 0);

let workerPoolUnavailable = false;
const poolUnavailable = (reason: string): void => {
    workerPoolUnavailable = true;
    process.stderr.write(`no worker pool: ${reason}\n`);
};

const createGenerator = (
    workerHeapStats: SharedArrayBuffer | undefined,
    workerStartupStats: SharedArrayBuffer | undefined,
    terrainTileBuildStats: SharedArrayBuffer,
    sharedTerrainTileStore: SharedTerrainTileStore | undefined,
    includeHeapSnapshots = false
): DataDrivenGenerator =>
    new DataDrivenGenerator({
        registries,
        templates,
        terrainTileBuildStats,
        ...(sharedTerrainTileStore === undefined ? {} : { sharedTerrainTileStore }),
        ...(sharedClimateParameters === undefined ? { shareClimateTables: false } : { sharedClimateParameters }),
        ...(arm === 'terrain' ? { decorate: false, structures: false } : {}),
        ...(arm === 'structures' ? { decorate: false } : {}),
        ...(workers > 0 && arm === 'chunks'
            ? {
                  chunks: {
                      pipeline: defaultChunkPipeline(),
                      workers,
                      regionChunks,
                      stealAfter,
                      ...(workerHeapStats === undefined ? {} : { workerHeapStats }),
                      ...(workerStartupStats === undefined ? {} : { workerStartupStats }),
                      ...(includeHeapSnapshots && workerHeapSnapshotDirectory !== undefined
                          ? { workerHeapSnapshotDirectory }
                          : {}),
                      onUnavailable: poolUnavailable
                  }
              }
            : {}),
        ...(workers > 0 && arm === 'stages'
            ? {
                  stages: {
                      pipeline: defaultChunkPipeline(),
                      workers,
                      javaTemplates: true,
                      ...(workerHeapStats === undefined ? {} : { workerHeapStats }),
                      ...(workerStartupStats === undefined ? {} : { workerStartupStats }),
                      ...(includeHeapSnapshots && workerHeapSnapshotDirectory !== undefined
                          ? { workerHeapSnapshotDirectory }
                          : {}),
                      onUnavailable: poolUnavailable
                  }
              }
            : {}),
        ...(workers > 0 && arm !== 'chunks' && arm !== 'stages'
            ? {
                  terrain: {
                      pipeline: defaultTerrainPipeline(),
                      workers,
                      ...(workerHeapStats === undefined ? {} : { workerHeapStats }),
                      ...(workerStartupStats === undefined ? {} : { workerStartupStats }),
                      ...(includeHeapSnapshots && workerHeapSnapshotDirectory !== undefined
                          ? { workerHeapSnapshotDirectory }
                          : {}),
                      onUnavailable: poolUnavailable
                  }
              }
            : {})
    });

/** A square of chunks, side by side, the way a start region fills. */
const side = Math.ceil(Math.sqrt(chunks));
const positions = Array.from({ length: chunks }, (_unused, index) => [index % side, Math.trunc(index / side)] as const);
const terrainRadius = arm === 'terrain' || arm === 'structures' ? 0 : 2;
const uniqueTerrainTiles = new Set<string>();
for (const [x, z] of positions) {
    for (let dz = -terrainRadius; dz <= terrainRadius; dz++) {
        for (let dx = -terrainRadius; dx <= terrainRadius; dx++) uniqueTerrainTiles.add(`${x + dx},${z + dz}`);
    }
}

interface Run {
    readonly ms: number;
    readonly generatorInitializationMs: number;
    readonly terrainTileStoreInitializationMs: number;
    readonly terrainTileStoreBytes: number;
    readonly processCpuMs: number;
    readonly mainHeapUsedBytes: number;
    readonly mainArrayBufferBytes: number;
    readonly rssBytes: number;
    readonly outputDigest: string;
    readonly workerHeapUsedBytes: readonly number[];
    readonly workerStartup: readonly {
        readonly firstTaskWallMs: number;
        readonly firstTaskCpuMs: number;
        readonly firstTaskHeapBytes: number;
    }[];
    readonly terrainTileBuildCount: number;
    readonly terrainTileStoreStats?: ReturnType<SharedTerrainTileStore['getStats']>;
    readonly uniqueTerrainTileCount: number;
    readonly duplicateTerrainTileBuilds: number;
    readonly blockIndexBytes: number;
    readonly taskStats: GenerationStatsSnapshot | undefined;
}

const run = async (includeHeapSnapshots = false): Promise<Run> => {
    const workerHeapStats =
        workers > 0 ? new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * (workers + 1)) : undefined;
    const workerStartupStats =
        workers > 0 ? new SharedArrayBuffer(BigInt64Array.BYTES_PER_ELEMENT * (workers * 3 + 1)) : undefined;
    const terrainTileBuildStats = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
    const tileStoreStarted = performance.now();
    const sharedTerrainTileStore =
        terrainTileMode === 'shared'
            ? new SharedTerrainTileStore({
                  maxBytes: terrainTileStoreMiB * 1024 * 1024,
                  maxTileBytes: 512 * 1024
              })
            : undefined;
    const terrainTileStoreInitializationMs = performance.now() - tileStoreStarted;
    // Each generator retains finished chunks by coordinate, so a fresh instance keeps every
    // warmup and sample on the generation path instead of measuring a cache hit.
    const generatorStarted = performance.now();
    const generator = createGenerator(
        workerHeapStats,
        workerStartupStats,
        terrainTileBuildStats,
        sharedTerrainTileStore,
        includeHeapSnapshots
    );
    const generatorInitializationMs = performance.now() - generatorStarted;
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
        // Read before the pool is stopped. Only a pooled arm has any.
        const taskStats = generator.generationControl()?.stats();
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
        const startupCount = startupStats === undefined ? 0 : Number(Atomics.load(startupStats, 0));
        const workerStartup =
            startupStats === undefined
                ? []
                : Array.from({ length: startupCount }, (_unused, index) => {
                      const offset = index * 3 + 1;
                      return {
                          firstTaskWallMs: Number(Atomics.load(startupStats, offset)) / 1000,
                          firstTaskCpuMs: Number(Atomics.load(startupStats, offset + 1)) / 1000,
                          firstTaskHeapBytes: Number(Atomics.load(startupStats, offset + 2))
                      };
                  });
        const terrainTileBuildCount = Atomics.load(new Int32Array(terrainTileBuildStats), 0);

        return {
            ms: elapsed,
            generatorInitializationMs,
            terrainTileStoreInitializationMs,
            terrainTileStoreBytes: sharedTerrainTileStore?.byteLength ?? 0,
            processCpuMs: (cpu.user + cpu.system) / 1000,
            mainHeapUsedBytes: memory.heapUsed,
            mainArrayBufferBytes: memory.arrayBuffers,
            rssBytes: memory.rss,
            outputDigest: output.digest('hex'),
            workerHeapUsedBytes,
            workerStartup,
            terrainTileBuildCount,
            ...(sharedTerrainTileStore === undefined
                ? {}
                : { terrainTileStoreStats: sharedTerrainTileStore.getStats() }),
            uniqueTerrainTileCount: uniqueTerrainTiles.size,
            duplicateTerrainTileBuilds: terrainTileBuildCount - uniqueTerrainTiles.size,
            blockIndexBytes,
            taskStats
        };
    } finally {
        generator.stopGenerating();
    }
};

if (workerHeapSnapshotDirectory !== undefined) await run(true);
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

/**
 * Chunks per CPU-second: chunks completed over the summed thread CPU time of every worker task,
 * the first of each worker included, because that is where the pipeline is built and a server
 * pays it too. Undefined for the arm that runs on this thread, which has no worker to ask.
 */
const chunksPerCpuSecond = (taskStats: GenerationStatsSnapshot | undefined): number | undefined => {
    if (taskStats === undefined) return undefined;
    const cpuMs = taskStats.byTask.reduce((total, entry) => total + entry.workerCpu.totalMs, 0);
    return cpuMs === 0 ? undefined : chunks / (cpuMs / 1000);
};
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
        requestedClimateTables: climateTables,
        effectiveClimateTables,
        requestedTerrainTileMode: terrainTileMode,
        terrainTileStoreMiB,
        regionChunks,
        stealAfter,
        warmups,
        samples: sampleCount,
        registriesLoadedMs: loaded,
        climateTableInitializationMs,
        sharedClimateTableBytes,
        workerHeapSnapshotDirectory,
        distributionMs: {
            min: times[0] ?? 0,
            p50,
            p95: percentile(times, 0.95),
            max: times.at(-1) ?? 0
        },
        processCpuMsForSamples: (cpuForSamples.user + cpuForSamples.system) / 1000,
        throughputChunksPerSecond: (chunks / p50) * 1000,
        processCpuMsByRun: runs.map(({ processCpuMs }) => processCpuMs),
        generatorInitializationMsByRun: runs.map(({ generatorInitializationMs }) => generatorInitializationMs),
        terrainTileStoreInitializationMsByRun: runs.map(
            ({ terrainTileStoreInitializationMs }) => terrainTileStoreInitializationMs
        ),
        terrainTileStoreBytesByRun: runs.map(({ terrainTileStoreBytes }) => terrainTileStoreBytes),
        mainHeapUsedBytesByRun: runs.map(({ mainHeapUsedBytes }) => mainHeapUsedBytes),
        mainArrayBufferBytesByRun: runs.map(({ mainArrayBufferBytes }) => mainArrayBufferBytes),
        rssBytesByRun: runs.map(({ rssBytes }) => rssBytes),
        workerHeapUsedBytesByRun: runs.map(({ workerHeapUsedBytes }) => workerHeapUsedBytes),
        workerStartupByRun: runs.map(({ workerStartup }) => workerStartup),
        terrainTileBuildCountByRun: runs.map(({ terrainTileBuildCount }) => terrainTileBuildCount),
        terrainTileStoreStatsByRun: runs.map(({ terrainTileStoreStats }) => terrainTileStoreStats),
        uniqueTerrainTileCount: runs[0]?.uniqueTerrainTileCount,
        duplicateTerrainTileBuildsByRun: runs.map(({ duplicateTerrainTileBuilds }) => duplicateTerrainTileBuilds),
        blockIndexBytes: runs[0]?.blockIndexBytes,
        blockIndexBytesPerChunk: (runs[0]?.blockIndexBytes ?? 0) / chunks,
        outputDigest: runs[0]?.outputDigest,
        chunksPerCpuSecondByRun: runs.map(({ taskStats }) => chunksPerCpuSecond(taskStats)),
        taskStatsByRun: runs.map(({ taskStats }) => taskStats)
    })}\n`
);
