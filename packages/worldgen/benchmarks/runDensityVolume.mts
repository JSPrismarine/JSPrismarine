import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { cpus, loadavg, tmpdir } from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

import { rolldown } from 'rolldown';

const here = path.dirname(fileURLToPath(import.meta.url));
const work = mkdtempSync(path.join(tmpdir(), 'jsp-density-volume-bench-'));
const MEMORY_REPETITIONS = 5;
const WORKER_COUNTS = [0, 1, 2, 4] as const;

interface PinnedJavaCorpusResult {
    readonly arm: 'scalar' | 'volume';
    readonly fullChunkDigest: string;
    readonly javaColumnsDigest: string;
    readonly columns: number;
    readonly blocks: number;
}

interface MemoryMeasurement {
    readonly arm: 'scalar' | 'volume';
    readonly heapSampledAllocationBytes: number;
    readonly heapSampleCount: number;
    readonly heapUsedBeforeBytes: number;
    readonly heapUsedAfterFillBytes: number;
    readonly heapUsedAfterGcBytes: number;
    readonly arrayBuffersBeforeBytes: number;
    readonly arrayBuffersAfterFillBytes: number;
    readonly arrayBuffersAfterGcBytes: number;
    readonly retainedArrayBufferDeltaBytes: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const pinnedResultOf = (value: unknown): PinnedJavaCorpusResult => {
    if (
        !isRecord(value) ||
        (value['arm'] !== 'scalar' && value['arm'] !== 'volume') ||
        typeof value['fullChunkDigest'] !== 'string' ||
        typeof value['javaColumnsDigest'] !== 'string' ||
        typeof value['columns'] !== 'number' ||
        typeof value['blocks'] !== 'number'
    ) {
        throw new TypeError('Density benchmark returned an invalid pinned Java corpus result');
    }
    return {
        arm: value['arm'],
        fullChunkDigest: value['fullChunkDigest'],
        javaColumnsDigest: value['javaColumnsDigest'],
        columns: value['columns'],
        blocks: value['blocks']
    };
};

const memoryResultOf = (value: unknown): MemoryMeasurement => {
    if (
        !isRecord(value) ||
        (value['arm'] !== 'scalar' && value['arm'] !== 'volume') ||
        typeof value['heapSampledAllocationBytes'] !== 'number' ||
        typeof value['heapSampleCount'] !== 'number' ||
        typeof value['heapUsedBeforeBytes'] !== 'number' ||
        typeof value['heapUsedAfterFillBytes'] !== 'number' ||
        typeof value['heapUsedAfterGcBytes'] !== 'number' ||
        typeof value['arrayBuffersBeforeBytes'] !== 'number' ||
        typeof value['arrayBuffersAfterFillBytes'] !== 'number' ||
        typeof value['arrayBuffersAfterGcBytes'] !== 'number' ||
        typeof value['retainedArrayBufferDeltaBytes'] !== 'number'
    ) {
        throw new TypeError('Density benchmark returned an invalid memory result');
    }
    return {
        arm: value['arm'],
        heapSampledAllocationBytes: value['heapSampledAllocationBytes'],
        heapSampleCount: value['heapSampleCount'],
        heapUsedBeforeBytes: value['heapUsedBeforeBytes'],
        heapUsedAfterFillBytes: value['heapUsedAfterFillBytes'],
        heapUsedAfterGcBytes: value['heapUsedAfterGcBytes'],
        arrayBuffersBeforeBytes: value['arrayBuffersBeforeBytes'],
        arrayBuffersAfterFillBytes: value['arrayBuffersAfterFillBytes'],
        arrayBuffersAfterGcBytes: value['arrayBuffersAfterGcBytes'],
        retainedArrayBufferDeltaBytes: value['retainedArrayBufferDeltaBytes']
    };
};

const median = (values: readonly number[]): number => {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    const lower = sorted[middle - 1];
    const upper = sorted[middle];
    if (upper === undefined) throw new Error('Cannot take the median of no measurements');
    return sorted.length % 2 === 0 && lower !== undefined ? (lower + upper) / 2 : upper;
};

const range = (values: readonly number[]): readonly [number, number] => {
    if (values.length === 0) throw new Error('Cannot take the range of no measurements');
    return [Math.min(...values), Math.max(...values)];
};

const memorySummary = (samples: readonly MemoryMeasurement[]) => {
    const heapAllocations = samples.map((sample) => sample.heapSampledAllocationBytes);
    const arrayBuffersAfterFill = samples.map(
        (sample) => sample.arrayBuffersAfterFillBytes - sample.arrayBuffersBeforeBytes
    );
    const retainedArrayBuffers = samples.map((sample) => sample.retainedArrayBufferDeltaBytes);
    const heapAfterGc = samples.map((sample) => sample.heapUsedAfterGcBytes - sample.heapUsedBeforeBytes);
    return {
        repetitions: samples.length,
        sampledHeapAllocationBytes: {
            median: median(heapAllocations),
            range: range(heapAllocations)
        },
        arrayBufferGrowthAfterFillBytes: {
            median: median(arrayBuffersAfterFill),
            range: range(arrayBuffersAfterFill)
        },
        retainedArrayBufferGrowthAfterGcBytes: {
            median: median(retainedArrayBuffers),
            range: range(retainedArrayBuffers)
        },
        heapUsedDeltaAfterGcBytes: {
            median: median(heapAfterGc),
            range: range(heapAfterGc)
        },
        sampledHeapObjectCount: samples.map((sample) => sample.heapSampleCount)
    };
};

try {
    const bundle = await rolldown({
        input: path.join(here, 'densityVolume.ts'),
        platform: 'node'
    });
    const entry = path.join(work, 'densityVolume.mjs');
    await bundle.write({ file: entry, format: 'esm', codeSplitting: false });
    await bundle.close();
    const logicalCpuCount = cpus().length;
    const loadAverageAtStart = loadavg();

    const runWorker = async (task: string): Promise<unknown> => {
        const worker = new Worker(entry, { workerData: task });
        const [result] = await once(worker, 'message');
        const [exitCode] = await once(worker, 'exit');
        if (exitCode !== 0) throw new Error(`Density volume benchmark worker exited with code ${String(exitCode)}`);
        return result;
    };

    const runProcess = (task: string, exposeGc = false): unknown => {
        const args = exposeGc ? ['--expose-gc', entry, task] : [entry, task];
        return JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8' })) as unknown;
    };

    const comparison = await runWorker('compare');
    const pinnedJavaCorpus = [];
    let firstCorpusDigests: { readonly fullChunkDigest: string; readonly javaColumnsDigest: string } | undefined;
    for (const workerCount of WORKER_COUNTS) {
        const collect = async (arm: 'scalar' | 'volume'): Promise<PinnedJavaCorpusResult[]> => {
            const values =
                workerCount === 0
                    ? [runProcess(`pinned:${arm}`)]
                    : await Promise.all(Array.from({ length: workerCount }, () => runWorker(`pinned:${arm}`)));
            const results = values.map(pinnedResultOf);
            const first = results[0];
            if (first === undefined) throw new Error(`Worker count ${workerCount} produced no ${arm} corpus result`);
            for (const result of results) {
                if (
                    result.fullChunkDigest !== first.fullChunkDigest ||
                    result.javaColumnsDigest !== first.javaColumnsDigest ||
                    result.columns !== first.columns ||
                    result.blocks !== first.blocks
                ) {
                    throw new Error(`The ${arm} digest changed between workers at worker count ${workerCount}`);
                }
            }
            return results;
        };

        const scalar = await collect('scalar');
        const volume = await collect('volume');
        const scalarFirst = scalar[0];
        const volumeFirst = volume[0];
        if (scalarFirst === undefined || volumeFirst === undefined) throw new Error('Corpus digest is missing');
        if (
            scalarFirst.fullChunkDigest !== volumeFirst.fullChunkDigest ||
            scalarFirst.javaColumnsDigest !== volumeFirst.javaColumnsDigest
        ) {
            throw new Error(`Scalar and volume corpus digests differ with ${workerCount} workers`);
        }
        if (
            firstCorpusDigests !== undefined &&
            (firstCorpusDigests.fullChunkDigest !== scalarFirst.fullChunkDigest ||
                firstCorpusDigests.javaColumnsDigest !== scalarFirst.javaColumnsDigest)
        ) {
            throw new Error(`Pinned Java corpus digest changed with ${workerCount} workers`);
        }
        firstCorpusDigests ??= {
            fullChunkDigest: scalarFirst.fullChunkDigest,
            javaColumnsDigest: scalarFirst.javaColumnsDigest
        };
        pinnedJavaCorpus.push({
            workerCount,
            executions: workerCount === 0 ? 1 : workerCount,
            columns: scalarFirst.columns,
            blocks: scalarFirst.blocks,
            scalarFullChunkDigest: scalarFirst.fullChunkDigest,
            volumeFullChunkDigest: volumeFirst.fullChunkDigest,
            scalarJavaColumnsDigest: scalarFirst.javaColumnsDigest,
            volumeJavaColumnsDigest: volumeFirst.javaColumnsDigest
        });
    }

    const memorySamples: Record<'scalar' | 'volume', MemoryMeasurement[]> = { scalar: [], volume: [] };
    for (let repetition = 0; repetition < MEMORY_REPETITIONS; repetition++) {
        const order: readonly ('scalar' | 'volume')[] =
            repetition % 2 === 0 ? ['scalar', 'volume'] : ['volume', 'scalar'];
        for (const arm of order) {
            memorySamples[arm].push(memoryResultOf(runProcess(`memory:${arm}`, true)));
        }
    }

    const scalarMemory = memorySummary(memorySamples.scalar);
    const volumeMemory = memorySummary(memorySamples.volume);
    const loadAverageAtEnd = loadavg();
    const quietLoadLimit = Math.max(1, logicalCpuCount / 4);
    const loadAtStartOneMinute = loadAverageAtStart[0] ?? Number.POSITIVE_INFINITY;
    const loadAtEndOneMinute = loadAverageAtEnd[0] ?? Number.POSITIVE_INFINITY;
    process.stdout.write(
        `${JSON.stringify(
            {
                host: {
                    logicalCpuCount,
                    loadAverageAtStart,
                    loadAverageAtEnd,
                    quietLoadLimit,
                    quietCheckAvailable: process.platform !== 'win32',
                    quiet:
                        process.platform !== 'win32' &&
                        loadAtStartOneMinute <= quietLoadLimit &&
                        loadAtEndOneMinute <= quietLoadLimit
                },
                comparison,
                pinnedJavaCorpus: {
                    workerCounts: pinnedJavaCorpus,
                    digestsMatch: true,
                    note: 'Each worker independently generated the full pinned chunk; this checks evaluator isolation, not worker-pool throughput.'
                },
                allocationMeasurement: {
                    method: 'Five isolated --expose-gc child-process runs per arm; V8 HeapProfiler sampling at 1024-byte intervals; ArrayBuffer usage sampled before fill, after fill, and after forced GC while the sampler remained live.',
                    scalar: scalarMemory,
                    volume: volumeMemory
                }
            },
            null,
            2
        )}\n`
    );
} finally {
    rmSync(work, { recursive: true, force: true });
}
