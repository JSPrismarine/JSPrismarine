/**
 * A pool of worker threads that run status bodies.
 *
 * The pool knows a chunk position and a status name and nothing else about world generation, so
 * `@jsprismarine/chunkgen` does not depend on the server. A caller names a *pipeline module*; each
 * worker imports it once, hands it the setup value, and keeps what it builds for the life of the
 * worker. That is what makes a worker worth starting: a seed's noise tables cost 55 to 134 ms to
 * build and the 7594-entry climate biome source 145 to 345 ms, so a worker is pinned to one world
 * rather than told which world each task belongs to.
 *
 * Only statuses that write their own chunk and nothing else belong here. `terrain` is one, which
 * is why Java sends it to a thread pool and keeps `features`, which writes radius 1, on a single
 * executor. Two `terrain` bodies can never touch the same block, so no two workers can race and
 * the result does not depend on which worker ran which chunk.
 *
 * Costs measured on this machine: 17 ms to build a pool of six, 13.8 microseconds a dispatch with
 * six in flight, and 20 microseconds of main thread CPU to receive a transferred 192 KiB column.
 * At 100 chunks a second that is 0.2% of a core, so the boundary is not what limits this.
 */
import { fileURLToPath } from 'node:url';

import Piscina from 'piscina';

import type { ChunkStatus } from './ChunkStatus';

/** What a worker is asked to do: advance one chunk to one status. */
export interface GenerationTask {
    /** The status the body being run produces. */
    readonly status: ChunkStatus;
    readonly chunkX: number;
    readonly chunkZ: number;
    /**
     * Anything else the body needs, structured-cloned to the worker.
     *
     * The inputs a status reads that the worker cannot derive from the seed and the position. A
     * `terrain` body is handed the structure pieces that push its terrain around, because laying
     * structures out is the main thread's job and reading them is not worth duplicating six
     * times.
     */
    readonly input?: unknown;
}

/** What a status body in a worker hands back. */
export interface GenerationResult {
    /** The chunk, flattened into something `postMessage` moves rather than copies. */
    readonly payload: unknown;
    /** Every `ArrayBuffer` in the payload, so it is transferred rather than cloned. */
    readonly transferList: readonly ArrayBuffer[];
}

/** The status bodies a pipeline module builds for one world. */
export interface WorkerPipeline {
    /**
     * Runs one status body.
     *
     * @throws Whatever the body throws. The pool reports it as a rejection on the task rather
     * than leaving the caller waiting, which is the failure mode a pool has to get right.
     */
    run(task: GenerationTask): Promise<GenerationResult> | GenerationResult;
}

/**
 * What a pipeline module exports.
 *
 * Called once per worker, with the setup value the pool was built with. Everything expensive that
 * depends only on the seed belongs inside it.
 */
export type WorkerPipelineFactory = (setup: unknown) => Promise<WorkerPipeline> | WorkerPipeline;

/** What the worker entry is told when it starts, through `workerData`. */
export interface GenerationWorkerData {
    /** The module specifier a worker imports to get its {@link WorkerPipelineFactory}. */
    readonly pipeline: string;
    /** Handed to the factory. Cloned to each worker, so keep it flat and keep it small. */
    readonly setup: unknown;
}

/** How a {@link GenerationPool} is built. */
export interface GenerationPoolOptions {
    /**
     * The module each worker imports to get its status bodies.
     *
     * A path or a `file:` URL that Node can `import()` from a worker thread, which means built
     * JavaScript rather than the raw TypeScript a dev checkout resolves `@jsprismarine/*` to.
     * The module exports `createGenerationPipeline`, a {@link WorkerPipelineFactory}.
     */
    readonly pipeline: string;
    /**
     * The worker entry itself, which defaults to {@link defaultGenerationWorker}.
     *
     * Named only by a caller that has its own, and by the tests.
     */
    readonly worker?: string;
    /**
     * How many workers to start.
     *
     * Five or six on this machine. Aggregate throughput peaks at 4.7 times one thread there and
     * declines past six, because six of the eight cores are performance cores and each worker is
     * a whole V8 isolate with its own garbage collector.
     */
    readonly workers: number;
    /** Handed to every worker's {@link WorkerPipelineFactory}. */
    readonly setup?: unknown;
}

/** Raised when a pool is asked for work after it has been shut down. */
export class GenerationPoolClosedError extends Error {
    public override name = 'GenerationPoolClosedError';

    public constructor(chunkX: number, chunkZ: number) {
        super(`The generation pool is closed, so the chunk at ${chunkX}, ${chunkZ} was not built.`);
    }
}

/** The subset of piscina this uses, so the pool can be built over a double in a test. */
interface TaskRunner {
    run(task: GenerationTask, options?: { transferList?: readonly ArrayBuffer[] }): Promise<GenerationResult>;
    destroy(): Promise<void>;
    readonly threads: readonly unknown[];
}

/** Builds the task runner. Separated so a test can drive the pool without starting threads. */
export type TaskRunnerFactory = (options: GenerationPoolOptions) => TaskRunner;

/**
 * This package's own worker entry, beside this file.
 *
 * `.es.js` in a built package and `.ts` in a dev checkout, which a worker thread can import
 * either way because Node strips types. Resolved rather than configured, so a caller does not
 * have to know which of the two it is running against.
 */
export const defaultGenerationWorker = (): string => {
    const beside = import.meta.url.endsWith('.ts') ? './generationWorker.ts' : './generationWorker.es.js';
    return fileURLToPath(new URL(beside, import.meta.url));
};

/**
 * A fixed pool of piscina workers.
 *
 * Fixed rather than elastic: a worker's value is the pipeline it has already built, so one that
 * is retired for being idle throws away the 200 to 400 ms that went into it.
 */
const piscinaRunner: TaskRunnerFactory = (options) =>
    new Piscina<GenerationTask, GenerationResult>({
        filename: options.worker ?? defaultGenerationWorker(),
        minThreads: options.workers,
        maxThreads: options.workers,
        workerData: { pipeline: options.pipeline, setup: options.setup } satisfies GenerationWorkerData
    });

/**
 * Runs status bodies in worker threads.
 *
 * The main thread keeps the holders, the scheduler, the feature patch merge and the translation
 * to Bedrock runtime ids. A worker only ever sees one chunk's worth of work and hands back flat
 * typed arrays.
 */
export class GenerationPool {
    private readonly runner: TaskRunner;
    private closed = false;

    /**
     * @param options - The pipeline module, the worker entry, the worker count and the setup.
     * @param runner - How to build the task runner. Defaults to piscina; a test passes a double.
     */
    public constructor(
        public readonly options: GenerationPoolOptions,
        runner: TaskRunnerFactory = piscinaRunner
    ) {
        this.runner = runner(options);
    }

    /** How many workers are up. Zero once the pool has been shut down. */
    public get workers(): number {
        return this.runner.threads.length;
    }

    /**
     * Runs one status body in whichever worker is free.
     *
     * @param task - The status, the position and whatever else the body reads.
     * @returns What the body produced, with its buffers now owned by this thread.
     * @throws GenerationPoolClosedError when the pool has been shut down.
     * @throws Whatever the body threw, so a worker that fails rejects the request rather than
     * leaving it outstanding forever.
     */
    public async run(task: GenerationTask): Promise<GenerationResult> {
        if (this.closed) throw new GenerationPoolClosedError(task.chunkX, task.chunkZ);

        return this.runner.run(task);
    }

    /**
     * Stops every worker, interrupting whatever they are doing.
     *
     * Worker threads do not receive signals, so terminating them is the only way to stop one
     * mid-chunk. Measured at 2 to 24 ms for a worker in a tight loop.
     */
    public async destroy(): Promise<void> {
        if (this.closed) return;

        this.closed = true;
        await this.runner.destroy();
    }
}
