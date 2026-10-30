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
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import Piscina from 'piscina';

import type { ChunkStatus } from './ChunkStatus';

/**
 * Where a compiled Bun executable embedded this package's worker entry, defined at build time
 * by `.github/scripts/build-aot.mjs`, which passes the worker as an extra compile entrypoint.
 * Undefined everywhere else.
 */
declare const JSP_EMBEDDED_GENERATION_WORKER: string | undefined;

/** The embedded worker entry of a compiled Bun executable, or undefined outside one. */
const embeddedGenerationWorker = (): string | undefined =>
    typeof JSP_EMBEDDED_GENERATION_WORKER === 'undefined' ? undefined : JSP_EMBEDDED_GENERATION_WORKER;

/** Whether a specifier names a module inside a compiled Bun executable's virtual filesystem. */
const insideCompiledBundle = (specifier: string): boolean =>
    specifier.includes('/$bunfs/') || specifier.includes('~BUN');

/**
 * Whether this process is a compiled executable, which keeps its modules inside the binary.
 *
 * Both packagers this project ships produce one, and both leave a worker thread with no file to
 * import. Node's single executable answers through `node:sea`; a Bun-compiled binary reports a
 * main module under Bun's virtual filesystem root. The `node:sea` lookup is deliberately a
 * `require` inside a `try`: Bun implements no such module and resolving the specifier statically
 * throws `No such built-in module` before anything runs, which is what used to kill the compiled
 * binary at startup. This package depends on nothing but `piscina`, so the predicate lives here
 * rather than in a package it would have to take a dependency on to reach.
 */
const inCompiledBinary = (): boolean => {
    const main = (globalThis as { Bun?: { main?: string } }).Bun?.main;
    // `/$bunfs/` on POSIX, `B:\~BUN\` on Windows.
    if (main !== undefined) return main.includes('/$bunfs/') || main.includes('~BUN');

    try {
        const load = createRequire(import.meta.url);
        return (load('node:sea') as typeof import('node:sea')).isSea();
    } catch {
        return false;
    }
};

/**
 * How badly a caller wants a chunk, highest first.
 *
 * The pool holds back everything it is not already running, so this is the order the backlog is
 * drained in rather than a hint. Three bands rather than a number, because the three are the
 * three questions a server actually asks:
 *
 * - `immediate`: somebody is waiting. A player stood on it, or a command has to answer.
 * - `soon`: it is wanted inside the next few seconds. The chunks a player is walking towards.
 * - `idle`: it would be nice to have. The outer rim of a large view distance, a preload running
 *   behind a world that is already open.
 */
export const GENERATION_PRIORITIES = ['immediate', 'soon', 'idle'] as const;

/** One of {@link GENERATION_PRIORITIES}. */
export type GenerationPriority = (typeof GENERATION_PRIORITIES)[number];

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
     * A path or a `file:` URL, exporting `createGenerationPipeline`, a
     * {@link WorkerPipelineFactory}. TypeScript is as good as JavaScript here: a worker thread
     * inherits `process.execArgv`, so whatever loader the host was started with is already
     * installed in the worker, and a host running under `--import tsx` hands its workers a
     * loader that follows the extensionless `@jsprismarine/*` imports a dev checkout is full of.
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
    /**
     * How many tasks may be with the workers at once, which defaults to one more than there are
     * workers.
     *
     * Everything above this waits in the pool's own queue, where {@link GenerationPriority}
     * still orders it; everything below it has already been handed to piscina, which dispatches
     * in arrival order and cannot be re-ordered afterwards. So this is the trade: at the worker
     * count exactly, a worker that finishes waits a microtask for its next task, and at a large
     * multiple the bands stop meaning anything because the whole backlog is already downstream.
     *
     * One spare is what keeps both: every worker has work, one task is staged behind them, and
     * the worst a newly arrived `immediate` can wait is the one staged chunk.
     */
    readonly inFlight?: number;
}

/** Raised when a pool is asked for work after it has been shut down. */
export class GenerationPoolClosedError extends Error {
    public override name = 'GenerationPoolClosedError';

    public constructor(chunkX: number, chunkZ: number) {
        super(`The generation pool is closed, so the chunk at ${chunkX}, ${chunkZ} was not built.`);
    }
}

/** Raised when a task is dropped from the backlog before a worker ever saw it. */
export class GenerationCanceledError extends Error {
    public override name = 'GenerationCanceledError';

    public constructor(chunkX: number, chunkZ: number) {
        super(`The chunk at ${chunkX}, ${chunkZ} was no longer wanted, so it was dropped from the queue.`);
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

/** One task in the backlog, waiting for a worker to come free. */
interface Waiting {
    readonly task: GenerationTask;
    readonly settle: (result: Promise<GenerationResult>) => void;
    readonly drop: (error: Error) => void;
}

/**
 * This package's own worker entry, beside this file.
 *
 * `.es.js` in a built package and `.ts` in a dev checkout, which a worker thread can import
 * either way because Node strips types. Resolved rather than configured, so a caller does not
 * have to know which of the two it is running against.
 */
export const defaultGenerationWorker = (): string => {
    const embedded = embeddedGenerationWorker();
    if (embedded !== undefined) return embedded;

    const beside = import.meta.url.endsWith('.ts') ? './generationWorker.ts' : './generationWorker.es.js';
    return fileURLToPath(new URL(beside, import.meta.url));
};

/**
 * The file a module specifier names, or undefined when it names a package instead.
 *
 * A bare specifier is resolved by whatever loader the worker ends up with, so there is nothing
 * to look for on disk and nothing to refuse a pool over.
 */
const fileBehind = (specifier: string): string | undefined => {
    if (specifier.startsWith('file:')) return fileURLToPath(specifier);
    if (specifier.startsWith('.') || isAbsolute(specifier)) return specifier;

    return undefined;
};

const workerModuleSpecifier = (specifier: string): string => {
    if (specifier.startsWith('file:')) return specifier;
    const file = fileBehind(specifier);
    return file === undefined ? specifier : pathToFileURL(resolve(file)).href;
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
        workerData: {
            pipeline: workerModuleSpecifier(options.pipeline),
            setup: options.setup
        } satisfies GenerationWorkerData
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

    /** The backlog, one list per band, each in arrival order. */
    private readonly waiting = new Map<GenerationPriority, Waiting[]>(GENERATION_PRIORITIES.map((band) => [band, []]));

    /** How many tasks the workers are holding, which is what the backlog is released against. */
    private running = 0;

    /** How many tasks may be with the workers at once. */
    private readonly capacity: number;

    /**
     * Why this process cannot run workers, or undefined when it can.
     *
     * A worker thread is a second module loader rather than a copy of this one, so it reads the
     * worker entry and the pipeline off disk through Node's own resolution. A single executable
     * keeps its modules inside the binary and has neither file, and piscina's own worker entry
     * is in there with them. Asking before building is what lets a caller log one line and do
     * the work on its own thread, instead of starting six workers that reject every task.
     *
     * This does not promise the pipeline imports cleanly once a worker has it. That depends on
     * the loader the host was started with, which only the import itself can settle, so a
     * caller still needs a fallback for the first task.
     *
     * @param options - The options {@link GenerationPool} would be built with.
     * @returns A sentence naming what is missing, or undefined when nothing is.
     */
    public static unavailable(options: GenerationPoolOptions): string | undefined {
        // A compiled Bun executable embeds the worker entry and the pipeline modules as extra
        // compile entrypoints, named by build-time constants, so its workers import them from
        // inside the binary. Only a compiled binary built without them - Node's single
        // executable has no equivalent - has nothing a worker thread could import.
        if (inCompiledBinary() && embeddedGenerationWorker() === undefined) {
            return 'this executable was compiled without its worker entrypoints, which keeps its modules where a worker thread cannot import them';
        }

        const entries = [
            ['worker entry', options.worker ?? defaultGenerationWorker()],
            ['pipeline module', options.pipeline]
        ] as const;
        for (const [what, specifier] of entries) {
            if (insideCompiledBundle(specifier)) continue; // Embedded; there is no file to check.
            const file = fileBehind(specifier);
            if (file !== undefined && !existsSync(file)) return `the ${what} ${file} is not on disk`;
        }

        return undefined;
    }

    /**
     * @param options - The pipeline module, the worker entry, the worker count and the setup.
     * @param runner - How to build the task runner. Defaults to piscina; a test passes a double.
     */
    public constructor(
        public readonly options: GenerationPoolOptions,
        runner: TaskRunnerFactory = piscinaRunner
    ) {
        this.runner = runner(options);
        this.capacity = Math.max(1, Math.trunc(options.inFlight ?? options.workers + 1));
    }

    /** How many workers are up. Zero once the pool has been shut down. */
    public get workers(): number {
        return this.runner.threads.length;
    }

    /** How many tasks the workers are holding right now. */
    public get inFlight(): number {
        return this.running;
    }

    /** How many tasks are waiting for a worker, across every band. */
    public get queued(): number {
        let total = 0;
        for (const band of this.waiting.values()) total += band.length;

        return total;
    }

    /**
     * Runs one status body in whichever worker is free.
     *
     * A task above the in-flight limit waits here rather than downstream, so a request that
     * arrives while the queue is long is still served in {@link GenerationPriority} order
     * instead of behind everything that was asked for first.
     *
     * @param task - The status, the position and whatever else the body reads.
     * @param priority - Which band the task waits in. Defaults to `immediate`, so a caller that
     * has not thought about it gets the behavior it would have had with no queue at all.
     * @returns What the body produced, with its buffers now owned by this thread.
     * @throws GenerationPoolClosedError when the pool has been shut down, whether that was
     * before the task was asked for or while it was waiting.
     * @throws GenerationCanceledError when {@link GenerationPool.cancel} dropped it.
     * @throws Whatever the body threw, so a worker that fails rejects the request rather than
     * leaving it outstanding forever.
     */
    public async run(task: GenerationTask, priority: GenerationPriority = 'immediate'): Promise<GenerationResult> {
        if (this.closed) throw new GenerationPoolClosedError(task.chunkX, task.chunkZ);
        if (this.running < this.capacity) return this.dispatch(task);

        return new Promise<GenerationResult>((resolve, reject) => {
            this.waiting.get(priority)!.push({ task, settle: (result) => resolve(result), drop: reject });
        });
    }

    /**
     * Drops every waiting task a predicate picks out, and reports how many went.
     *
     * Only the backlog: a task a worker already has cannot be taken back without terminating
     * the worker, which costs more than letting the chunk finish. That is the right trade for
     * what this is for - a player turning around leaves an `idle` rim nobody will ever look at,
     * and the few already running are the cheapest part of it.
     *
     * @param wanted - Answers true for a task that should still be built.
     * @returns How many tasks were dropped.
     */
    public cancel(wanted: (task: GenerationTask) => boolean): number {
        let dropped = 0;
        for (const [band, tasks] of this.waiting) {
            const keep: Waiting[] = [];
            for (const entry of tasks) {
                if (wanted(entry.task)) keep.push(entry);
                else {
                    dropped++;
                    entry.drop(new GenerationCanceledError(entry.task.chunkX, entry.task.chunkZ));
                }
            }
            this.waiting.set(band, keep);
        }

        return dropped;
    }

    /**
     * Moves waiting tasks up into a band, and reports how many moved.
     *
     * What a chunk that has become more urgent needs. A rim chunk asked for as `idle` is the
     * same chunk a player is standing on a moment later, and without this it would keep the
     * turn it was given when nobody wanted it. A task already in the band or above it is left
     * where it is, so this only ever moves work forward.
     *
     * Order inside the destination band is arrival order, and a promoted task arrives now: it
     * goes behind everything already waiting there, not in front of it.
     *
     * @param wanted - Answers true for a task that should move.
     * @param to - The band to move it into.
     * @returns How many tasks moved.
     */
    public promote(wanted: (task: GenerationTask) => boolean, to: GenerationPriority): number {
        const destination = GENERATION_PRIORITIES.indexOf(to);
        const moved: Waiting[] = [];

        for (const [band, tasks] of this.waiting) {
            if (GENERATION_PRIORITIES.indexOf(band) <= destination) continue;

            const keep: Waiting[] = [];
            for (const entry of tasks) {
                if (wanted(entry.task)) moved.push(entry);
                else keep.push(entry);
            }
            this.waiting.set(band, keep);
        }

        this.waiting.get(to)!.push(...moved);
        return moved.length;
    }

    /**
     * Stops every worker, interrupting whatever they are doing.
     *
     * Worker threads do not receive signals, so terminating them is the only way to stop one
     * mid-chunk. Measured at 2 to 24 ms for a worker in a tight loop.
     *
     * Everything still in the backlog is refused first, so a shutdown does not leave a caller
     * waiting on a turn that is never going to come.
     */
    public async destroy(): Promise<void> {
        if (this.closed) return;

        this.closed = true;
        for (const [band, tasks] of this.waiting) {
            for (const entry of tasks) entry.drop(new GenerationPoolClosedError(entry.task.chunkX, entry.task.chunkZ));
            this.waiting.set(band, []);
        }
        await this.runner.destroy();
    }

    /** Hands one task to the workers and releases the backlog behind it when it settles. */
    private dispatch(task: GenerationTask): Promise<GenerationResult> {
        this.running++;
        const result = this.runner.run(task);
        // `finally` on its own would make the caller wait for the release, and a rejection here
        // is the caller's to see rather than this one's to handle.
        void result.then(
            () => this.release(),
            () => this.release()
        );

        return result;
    }

    /** Lets the highest-priority waiting task through, now that a slot has come free. */
    private release(): void {
        this.running--;
        if (this.closed) return;

        for (const band of GENERATION_PRIORITIES) {
            const tasks = this.waiting.get(band)!;
            const next = tasks.shift();
            if (next === undefined) continue;

            next.settle(this.dispatch(next.task));
            return;
        }
    }
}
