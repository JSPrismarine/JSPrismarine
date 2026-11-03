/**
 * What a generation worker runs.
 *
 * The module the pool names is imported once, on the first task, and what it builds is kept for
 * the life of the worker. Everything that depends only on the seed is therefore paid for once per
 * worker rather than once per chunk: the noise tables are 55 to 134 ms and the climate biome
 * source 145 to 345 ms, which is several chunks' worth either way.
 *
 * `Math.random` is shadowed here rather than only linted against. It is seeded independently per
 * V8 isolate, so a main thread and six workers produce seven different sequences; a decorator
 * that reached for it would give a different world depending on which worker ran the chunk, and
 * nothing downstream would notice. Everything random in Java's world generation is a positional
 * `Xoroshiro128++` or `LegacyRandom` derived from the seed, so there is nothing legitimate here
 * to break.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { writeHeapSnapshot } from 'node:v8';
import { threadId, workerData } from 'node:worker_threads';

import Piscina from 'piscina';

import type {
    GenerationResult,
    GenerationTask,
    GenerationWorkerData,
    WorkerPipeline,
    WorkerPipelineFactory
} from './GenerationPool';

/** Raised when the module the pool named is not a pipeline module. */
export class MissingPipelineFactoryError extends Error {
    public override name = 'MissingPipelineFactoryError';

    public constructor(specifier: string) {
        super(`${specifier} does not export createGenerationPipeline, so a worker has no status bodies to run.`);
    }
}

/**
 * Refuses the one source of randomness that differs between threads.
 *
 * @throws Error always. A generation path that reaches for it is a bug wherever it runs, and
 * here it is the difference between two workers building two different worlds.
 */
const refuseMathRandom = (): never => {
    throw new Error(
        'Math.random is seeded per V8 isolate, so a chunk that used it would depend on which ' +
            'worker built it. Draw from the seed and the position instead.'
    );
};

/** Whether a dynamically imported export is the factory a pipeline module owes. */
const isPipelineFactory = (value: unknown): value is WorkerPipelineFactory => typeof value === 'function';

/** Built once per worker, on the first task. */
let pipeline: Promise<WorkerPipeline> | undefined;

/** `GenerationPool` is the only code that starts this worker and writes its `workerData`. */
const workerDataFromParent = workerData as GenerationWorkerData;
const workerHeapStats =
    workerDataFromParent.workerHeapStats === undefined
        ? undefined
        : new Int32Array(workerDataFromParent.workerHeapStats);
const workerHeapSlot = workerHeapStats === undefined ? undefined : Atomics.add(workerHeapStats, 0, 1) + 1;
const workerStartupStats =
    workerDataFromParent.workerStartupStats === undefined
        ? undefined
        : new BigInt64Array(workerDataFromParent.workerStartupStats);
const workerStartupSlot = workerStartupStats === undefined ? undefined : Atomics.add(workerStartupStats, 0, 1n) + 1n;
let workerHeapSnapshotWritten = false;

if (workerHeapStats !== undefined && workerHeapSlot !== undefined && workerHeapSlot >= workerHeapStats.length) {
    throw new RangeError(`Worker ${threadId} has no slot in the chunk-worker heap stats buffer`);
}
if (
    workerStartupStats !== undefined &&
    workerStartupSlot !== undefined &&
    workerStartupSlot > BigInt(Math.floor((workerStartupStats.length - 1) / 3))
) {
    throw new RangeError(`Worker ${threadId} has no slot in the chunk-worker startup stats buffer`);
}

const load = async (): Promise<WorkerPipeline> => {
    // `workerData` is the object the pool wrote on the other side of a thread boundary, which
    // the compiler cannot follow. Nothing but this package writes it.
    const data = workerData as GenerationWorkerData;
    const module: Record<string, unknown> = await import(data.pipeline);
    const factory = module.createGenerationPipeline;
    if (!isPipelineFactory(factory)) throw new MissingPipelineFactoryError(data.pipeline);

    Math.random = refuseMathRandom;
    return factory(data.setup);
};

/**
 * Runs one status body and hands the chunk back by moving its buffers.
 *
 * @param task - The status, the position and whatever else the body reads.
 * @returns The payload, marked so piscina transfers its buffers rather than copying them. A
 * 192 KiB column costs 18 microseconds transferred against 76 cloned and 1370 as a `number[]`.
 * @throws MissingPipelineFactoryError when the pool was pointed at a module that is not one.
 */
export default async function runGenerationTask(task: GenerationTask): Promise<GenerationResult> {
    const firstTask = pipeline === undefined;
    const firstTaskStarted = firstTask && workerStartupStats !== undefined ? performance.now() : 0;
    const firstTaskCpu = firstTask && workerStartupStats !== undefined ? process.threadCpuUsage() : undefined;
    pipeline ??= load();
    const result = await (await pipeline).run(task);

    if (
        firstTask &&
        workerStartupStats !== undefined &&
        workerStartupSlot !== undefined &&
        firstTaskCpu !== undefined
    ) {
        const slot = 1 + Number(workerStartupSlot - 1n) * 3;
        const cpu = process.threadCpuUsage(firstTaskCpu);
        Atomics.store(workerStartupStats, slot, BigInt(Math.round((performance.now() - firstTaskStarted) * 1000)));
        Atomics.store(workerStartupStats, slot + 1, BigInt(cpu.user + cpu.system));
        Atomics.store(workerStartupStats, slot + 2, BigInt(getHeapStatistics().used_heap_size));
    }

    const snapshotDirectory = workerDataFromParent.workerHeapSnapshotDirectory;
    if (!workerHeapSnapshotWritten && snapshotDirectory !== undefined) {
        mkdirSync(snapshotDirectory, { recursive: true });
        writeHeapSnapshot(join(snapshotDirectory, `worker-${threadId}.heapsnapshot`));
        workerHeapSnapshotWritten = true;
    }

    if (workerHeapStats !== undefined && workerHeapSlot !== undefined) {
        Atomics.store(workerHeapStats, workerHeapSlot, getHeapStatistics().used_heap_size);
    }

    // piscina reads these two symbols to decide what travels in the transfer list and what the
    // caller receives. Both are plain symbols rather than `unique symbol`, so the shape is an
    // intersection with a symbol record rather than something an interface can spell.
    const moved: GenerationResult & Record<symbol, unknown> = {
        payload: result.payload,
        transferList: result.transferList,
        [Piscina.transferableSymbol]: result.transferList,
        [Piscina.valueSymbol]: { payload: result.payload, transferList: result.transferList }
    };

    return moved;
}
