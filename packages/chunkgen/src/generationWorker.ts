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
import { workerData } from 'node:worker_threads';

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
    pipeline ??= load();
    const result = await (await pipeline).run(task);

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
