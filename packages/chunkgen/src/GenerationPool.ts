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
import { Worker } from 'node:worker_threads';

import Piscina from 'piscina';

import type { ChunkStatus } from './ChunkStatus';
import type { GenerationStatsSnapshot, WorkerTaskStats } from './GenerationStats';
import { GenerationStatsRecorder } from './GenerationStats';

/**
 * Where a compiled Bun executable embedded this package's worker entry, defined at build time
 * by `.github/scripts/build-aot.mjs`, which passes the worker as an extra compile entrypoint.
 * It is `singleExecutableWorker`, the pool's own message protocol, because piscina starts its
 * threads from a module of its own that the binary does not carry. Undefined everywhere else.
 */
declare const JSP_EMBEDDED_GENERATION_WORKER: string | undefined;
/** The SEA asset name is defined by `scripts/package-sea.mts`. */
declare const JSP_SEA_GENERATION_WORKER: string | undefined;

/** The embedded worker entry of a compiled Bun executable, or undefined outside one. */
const embeddedGenerationWorker = (): string | undefined =>
    typeof JSP_EMBEDDED_GENERATION_WORKER === 'undefined' ? undefined : JSP_EMBEDDED_GENERATION_WORKER;

/** Whether Node is running this process as a single executable application. */
const isSingleExecutable = (): boolean => {
    try {
        return (createRequire(process.execPath)('node:sea') as typeof import('node:sea')).isSea();
    } catch {
        return false;
    }
};

/** Reads an embedded SEA module and gives a worker an importable URL for it. */
const singleExecutableModuleUrl = (asset: string): string | undefined => {
    try {
        const sea = createRequire(process.execPath)('node:sea') as typeof import('node:sea');
        if (!sea.isSea()) return undefined;
        return `data:text/javascript;base64,${Buffer.from(sea.getAsset(asset)).toString('base64')}`;
    } catch {
        return undefined;
    }
};

/** Whether a specifier names a module inside a compiled Bun executable's virtual filesystem. */
const insideCompiledBundle = (specifier: string): boolean =>
    specifier.includes('/$bunfs/') || specifier.includes('~BUN');

/**
 * Whether this process is a compiled executable, whose worker modules need an embedded entry.
 *
 * Node's single executable reports through `node:sea`; a Bun-compiled binary reports a main
 * module under Bun's virtual filesystem root. The `node:sea` lookup is deliberately a `require`
 * inside a `try`: Bun implements no such module and resolving the specifier statically throws
 * before anything runs. This package depends on nothing but `piscina`, so the predicate lives
 * here rather than in a package it would have to take a dependency on to reach.
 */
export const inCompiledBinary = (): boolean => {
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
     * The Bedrock id of the dimension the chunk is in: 0 for the Overworld, 1 for the Nether, 2
     * for the End, 1000 and up for a custom dimension.
     *
     * Part of the task so a pool shared between dimensions can tell their chunks apart.
     * `ShardedGenerationPool` mixes it into the shard hash, so chunk (0, 0) of two
     * dimensions does not always land on the same worker. The body is free to ignore it: a
     * worker pinned to one world builds what it was set up for, whatever the task names.
     */
    readonly dimension: number;
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
    /**
     * What the worker measured about this task. Set by the worker entries; a runner or a test
     * double that leaves it out simply contributes nothing to the worker columns of the stats.
     */
    readonly workerStats?: WorkerTaskStats;
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
    /** Optional benchmark buffer: one shared heap-used byte count per worker after its last task. */
    readonly workerHeapStats?: SharedArrayBuffer;
    /** Optional benchmark buffer: a leading slot count, then first-task wall/CPU microseconds and heap bytes per worker. */
    readonly workerStartupStats?: SharedArrayBuffer;
    /** Optional directory where each worker writes one heap snapshot after its first task. */
    readonly workerHeapSnapshotDirectory?: string;
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
     * A host that reads TypeScript through its own loader instead, which is vitest, has no such
     * flag to hand on, so the pool names the `tsx` beside the module itself; see
     * {@link workerExecArgv}.
     */
    readonly pipeline: string;
    /**
     * The worker entry, which defaults to {@link defaultGenerationWorker}. A `data:` URL uses
     * the embedded worker message protocol; file paths and URLs use piscina.
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
     * Optional benchmark sink with one `Int32` slot per worker plus a leading worker counter.
     * Each worker stores its isolate heap usage in bytes after its most recent task.
     */
    readonly workerHeapStats?: SharedArrayBuffer;
    /**
     * Optional `BigInt64Array` sink with one leading worker counter and three slots per worker:
     * first-task elapsed wall microseconds, thread CPU microseconds, and heap-used bytes.
     */
    readonly workerStartupStats?: SharedArrayBuffer;
    /**
     * Optional diagnostics directory. Each worker writes one `.heapsnapshot` after its first
     * completed task, so the snapshot contains the initialized pipeline and one task's result.
     */
    readonly workerHeapSnapshotDirectory?: string;
    /** Called with a worker thread ID after that worker exits, including pool shutdown. */
    readonly onWorkerExit?: (threadId: number) => void;
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
    /** The clock task timings are read from, in milliseconds. Defaults to `performance.now`; a test names its own. */
    readonly now?: () => number;
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
    run(task: GenerationTask): Promise<GenerationResult>;
    destroy(): Promise<void>;
    readonly threads: readonly unknown[];
}

/** Builds the task runner. Separated so a test can drive the pool without starting threads. */
export type TaskRunnerFactory = (options: GenerationPoolOptions) => TaskRunner;

/** One task in the backlog, waiting for a worker to come free. */
interface Waiting {
    readonly task: GenerationTask;
    readonly enqueuedAt: number;
    readonly settle: (result: Promise<GenerationResult>) => void;
    readonly drop: (error: Error) => void;
}

/**
 * This package's own worker entry, beside this file or embedded in a packaged executable.
 *
 * `.js` in a built package and `.ts` in a dev checkout, which a worker thread can import
 * either way because Node strips types. Single executables load their embedded worker from a
 * data URL. Resolved rather than configured, so a caller does not have to know which is running.
 */
export const defaultGenerationWorker = (): string => {
    const embedded = embeddedGenerationWorker();
    if (embedded !== undefined) return embedded;

    if (typeof JSP_SEA_GENERATION_WORKER !== 'undefined') {
        return singleExecutableModuleUrl(JSP_SEA_GENERATION_WORKER) ?? `sea-asset:${JSP_SEA_GENERATION_WORKER}`;
    }

    const beside = import.meta.url.endsWith('.ts') ? './generationWorker.ts' : './generationWorker.js';
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

/** Whether a specifier names TypeScript source, which only a dev checkout runs. */
const isTypeScriptSource = (specifier: string): boolean => /\.[cm]?ts$/.test(specifier);

/**
 * The flags that install an ES module loader in the thread they start.
 *
 * A worker inherits them with the rest of `process.execArgv`, so a host carrying one has already
 * given its workers whatever follows its imports. `--experimental-transform-types` is here
 * because it is the one flag that lets Node's own loader read this project's TypeScript.
 * `--require` is not: a CommonJS preload, which is how vitest starts its forks, cannot reach the
 * worker's `import()`.
 */
const LOADER_FLAGS = ['--import', '--loader', '--experimental-loader', '--experimental-transform-types'] as const;

const installsLoader = (flags: readonly string[]): boolean =>
    flags.some((flag) => LOADER_FLAGS.some((name) => flag === name || flag.startsWith(`${name}=`)));

/** What a thread was started with, which is what its workers inherit. */
export interface HostFlags {
    /** `process.execArgv`. */
    readonly execArgv: readonly string[];
    /** `NODE_OPTIONS`, which Node applies to every thread of the process. */
    readonly nodeOptions: string;
}

const currentHost = (): HostFlags => ({ execArgv: process.execArgv, nodeOptions: process.env.NODE_OPTIONS ?? '' });

/**
 * The `tsx` the package owning a TypeScript module declares, as a URL `--import` takes, or
 * undefined when there is none to find.
 *
 * Resolved from beside the module rather than from here, because that package is the one being
 * run from source and its dev dependencies are what say how. This package does not depend on
 * `tsx` and a built install never asks.
 */
const typeScriptLoader = (module: string): string | undefined => {
    try {
        return pathToFileURL(createRequire(pathToFileURL(resolve(module))).resolve('tsx')).href;
    } catch {
        return undefined;
    }
};

/** A task sent to a module worker started from a data URL. */
interface EmbeddedTask {
    readonly id: number;
    readonly task: GenerationTask;
    readonly resolve: (result: GenerationResult) => void;
    readonly reject: (error: Error) => void;
}

/** What the embedded worker posts back after running a task. */
interface EmbeddedReply {
    readonly id: number;
    readonly ok: boolean;
    readonly result?: GenerationResult;
    readonly error?: { readonly name: string; readonly message: string; readonly stack?: string };
}

/** One persistent module worker, with at most one task in flight. */
interface EmbeddedWorkerSlot {
    readonly worker: Worker;
    busy?: EmbeddedTask;
}

/** Runs a small persistent worker pool whose entry is bundled as a data URL. */
class EmbeddedTaskRunner implements TaskRunner {
    private readonly slots: EmbeddedWorkerSlot[] = [];
    private readonly waiting: EmbeddedTask[] = [];
    private readonly workerUrl: URL;
    private readonly workerData: GenerationWorkerData;
    private readonly maxWorkers: number;
    private nextId = 0;
    private closed = false;

    public constructor(options: GenerationPoolOptions, workerUrl: URL) {
        this.workerUrl = workerUrl;
        this.maxWorkers = options.workers;
        this.workerData = {
            pipeline: workerModuleSpecifier(options.pipeline),
            setup: options.setup,
            ...(options.workerHeapStats === undefined ? {} : { workerHeapStats: options.workerHeapStats }),
            ...(options.workerStartupStats === undefined ? {} : { workerStartupStats: options.workerStartupStats }),
            ...(options.workerHeapSnapshotDirectory === undefined
                ? {}
                : { workerHeapSnapshotDirectory: options.workerHeapSnapshotDirectory })
        };
    }

    public get threads(): readonly unknown[] {
        return this.slots.map(({ worker }) => worker);
    }

    public run(task: GenerationTask): Promise<GenerationResult> {
        if (this.closed) return Promise.reject(new Error('The embedded generation worker pool is closed'));

        return new Promise((resolve, reject) => {
            this.waiting.push({ id: this.nextId++, task, resolve, reject });
            this.dispatch();
        });
    }

    public async destroy(): Promise<void> {
        if (this.closed) return;
        this.closed = true;

        for (const task of this.waiting) task.reject(new Error('The embedded generation worker pool was closed'));
        this.waiting.length = 0;

        await Promise.all(
            this.slots.map(async ({ worker, busy }) => {
                busy?.reject(new Error('The embedded generation worker pool was closed'));
                await worker.terminate();
            })
        );
        this.slots.length = 0;
    }

    private dispatch(): void {
        while (!this.closed && this.waiting.length > 0) {
            let slot = this.slots.find((candidate) => candidate.busy === undefined);
            if (slot === undefined && this.slots.length < this.maxWorkers) {
                try {
                    slot = this.startWorker();
                } catch (error) {
                    this.waiting.shift()!.reject(error instanceof Error ? error : new Error(String(error)));
                    continue;
                }
            }
            if (slot === undefined) return;

            const task = this.waiting.shift()!;
            slot.busy = task;
            try {
                slot.worker.postMessage({ id: task.id, task: task.task });
            } catch (error) {
                this.failWorker(slot, error instanceof Error ? error : new Error(String(error)));
            }
        }
    }

    private startWorker(): EmbeddedWorkerSlot {
        const worker = new Worker(this.workerUrl, { workerData: this.workerData });
        const slot: EmbeddedWorkerSlot = { worker };
        this.slots.push(slot);

        worker.on('message', (reply: EmbeddedReply) => {
            const busy = slot.busy;
            if (busy === undefined || reply.id !== busy.id) {
                this.failWorker(slot, new Error('The embedded generation worker returned an unexpected task id'));
                return;
            }

            slot.busy = undefined;
            if (reply.ok && reply.result !== undefined) busy.resolve(reply.result);
            else {
                const error = new Error(
                    reply.error?.message ?? 'The embedded generation worker failed without an error'
                );
                error.name = reply.error?.name ?? 'Error';
                if (reply.error?.stack !== undefined) error.stack = reply.error.stack;
                busy.reject(error);
            }
            this.dispatch();
        });
        worker.on('error', (error: unknown) =>
            this.failWorker(slot, error instanceof Error ? error : new Error(String(error)))
        );
        worker.on('exit', (code) => {
            if (!this.closed) this.failWorker(slot, new Error(`Generation worker exited with code ${code}`));
        });

        return slot;
    }

    private failWorker(slot: EmbeddedWorkerSlot, error: Error): void {
        const index = this.slots.indexOf(slot);
        if (index < 0) return;
        this.slots.splice(index, 1);
        slot.busy?.reject(error);
        slot.busy = undefined;
        void slot.worker.terminate();
        this.dispatch();
    }
}

/**
 * The flags the workers start with, or undefined when inheriting this thread's is right.
 *
 * A worker thread is a second module loader and reads the pipeline off disk through Node's own
 * resolution. It inherits `process.execArgv`, so a host started with `--import tsx` hands its
 * workers the loader that follows a dev checkout's extensionless imports, and a built package
 * needs none. A host whose own loader is not Node's has nothing to hand on: under vitest this
 * thread reads TypeScript through Vite while a worker would read it through Node's strip-only
 * loader, which stops at the first extensionless relative import and rejects the parameter
 * properties and enums the source uses anyway. So when the pipeline or the worker entry is
 * TypeScript source and nothing in the host's flags installs a loader, the workers get the `tsx`
 * the pipeline's own package declares.
 *
 * @param options - The pipeline module and the worker entry.
 * @param host - This thread's flags. Defaults to the process's; a test names its own.
 * @returns The worker flags, or undefined to inherit.
 */
export const workerExecArgv = (
    options: Pick<GenerationPoolOptions, 'pipeline' | 'worker'>,
    host: HostFlags = currentHost()
): string[] | undefined => {
    const worker = options.worker ?? defaultGenerationWorker();
    const pipeline = fileBehind(options.pipeline);
    const source = [pipeline, worker].find((file) => file !== undefined && isTypeScriptSource(file));
    if (source === undefined) return undefined;
    if (installsLoader(host.execArgv) || installsLoader(host.nodeOptions.split(/\s+/))) return undefined;

    const loader = typeScriptLoader(source);
    return loader === undefined ? undefined : [...host.execArgv, '--import', loader];
};

/**
 * A lazily started pool of piscina workers.
 *
 * Workers start when the first task arrives and stay warm until the pool is destroyed. A worker's
 * value is the pipeline it has already built, so retiring it for being idle throws away the 200
 * to 400 ms that went into it.
 */
const piscinaRunner: TaskRunnerFactory = (options) => {
    const worker = options.worker ?? defaultGenerationWorker();
    // An executable's worker speaks the pool's own protocol: piscina would start each thread from
    // its `dist/worker.js`, which is a path on the machine that built the executable.
    if (worker.startsWith('data:') || insideCompiledBundle(worker))
        return new EmbeddedTaskRunner(options, new URL(worker));

    const execArgv = workerExecArgv(options);

    return new Piscina<GenerationTask, GenerationResult>({
        filename: options.worker ?? defaultGenerationWorker(),
        minThreads: 0,
        maxThreads: options.workers,
        idleTimeout: Infinity,
        ...(execArgv === undefined ? {} : { execArgv }),
        workerData: {
            pipeline: workerModuleSpecifier(options.pipeline),
            setup: options.setup,
            ...(options.workerHeapStats === undefined ? {} : { workerHeapStats: options.workerHeapStats }),
            ...(options.workerStartupStats === undefined ? {} : { workerStartupStats: options.workerStartupStats }),
            ...(options.workerHeapSnapshotDirectory === undefined
                ? {}
                : { workerHeapSnapshotDirectory: options.workerHeapSnapshotDirectory })
        } satisfies GenerationWorkerData
    });
};

/**
 * Runs status bodies in worker threads.
 *
 * The main thread keeps the holders, the scheduler, the feature patch merge and the translation
 * to Bedrock runtime ids. A worker only ever sees one chunk's worth of work and hands back flat
 * typed arrays.
 */
export class GenerationPool {
    private readonly runner: TaskRunner;
    private readonly observedWorkers = new WeakSet<Worker>();
    private closed = false;

    /** The backlog, one list per band, each in arrival order. */
    private readonly waiting = new Map<GenerationPriority, Waiting[]>(GENERATION_PRIORITIES.map((band) => [band, []]));

    /** How many tasks the workers are holding, which is what the backlog is released against. */
    private running = 0;

    /** How many tasks may be with the workers at once. */
    private readonly capacity: number;

    private readonly now: () => number;
    private readonly stats = new GenerationStatsRecorder();
    /** How many `soon` and `idle` tasks may be with workers at once; undefined means no limit. */
    private backgroundLimit: number | undefined;
    private runningBackground = 0;

    /**
     * Why this process cannot run workers, or undefined when it can.
     *
     * A worker thread is a second module loader rather than a copy of this one. The Node single
     * executable packages its worker and pipelines as assets; other hosts need those modules
     * available through Node's resolution. Asking before building lets a caller log one line
     * and do the work on its own thread instead of starting workers that cannot import modules.
     *
     * This does not promise the pipeline imports cleanly once a worker has it. That depends on
     * the loader the host was started with, which only the import itself can settle, so a
     * caller still needs a fallback for the first task.
     *
     * @param options - The options {@link GenerationPool} would be built with.
     * @returns A sentence naming what is missing, or undefined when nothing is.
     */
    public static unavailable(options: GenerationPoolOptions): string | undefined {
        // Bun embeds worker entrypoints in its virtual filesystem. Node's single executable
        // embeds assets and opens them as data URLs, with the pipeline loaded by the worker.
        const seaWorker = typeof JSP_SEA_GENERATION_WORKER !== 'undefined' && isSingleExecutable();
        if (inCompiledBinary() && embeddedGenerationWorker() === undefined && !seaWorker) {
            return 'this executable was compiled without its worker entrypoints, which keeps its modules where a worker thread cannot import them';
        }

        if (isSingleExecutable() && !options.pipeline.startsWith('sea-asset:')) {
            return `the pipeline module ${options.pipeline} is not embedded in this executable; rebuild it with the default generation pipeline to enable workers`;
        }

        if (isSingleExecutable() && options.worker !== undefined && !options.worker.startsWith('data:')) {
            return `the worker entry ${options.worker} is not embedded in this executable; rebuild it with the default generation worker to enable workers`;
        }

        const worker = options.worker ?? defaultGenerationWorker();
        if (isSingleExecutable() && worker.startsWith('sea-asset:')) {
            return `the embedded worker asset ${worker.slice('sea-asset:'.length)} could not be loaded; rebuild the single executable`;
        }

        const entries = [
            ['worker entry', worker],
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
        this.now = options.now ?? (() => performance.now());
    }

    /**
     * What the pool has recorded about the tasks it ran, by status and priority band.
     *
     * @returns A copy, so a caller can take two and subtract.
     */
    public statsSnapshot(): GenerationStatsSnapshot {
        return this.stats.snapshot();
    }

    /** Forgets the recorded task stats. */
    public resetStats(): void {
        this.stats.reset();
    }

    /**
     * Limits how many `soon` and `idle` tasks may be with workers at once. `immediate` tasks never
     * count against it and are never held back by it, so a chunk a player stands on is not slowed.
     *
     * Raising the limit starts waiting tasks at once. Lowering it does not interrupt a task a
     * worker has: the running count falls as they finish.
     *
     * @param limit - The most background tasks at once, or undefined for no limit.
     */
    public setBackgroundLimit(limit: number | undefined): void {
        this.backgroundLimit = limit === undefined ? undefined : Math.max(1, Math.trunc(limit));
        while (!this.closed && this.running < this.capacity && this.startNext()) {
            // Each started task takes a slot; the loop ends when the slots or the backlog do.
        }
    }

    /** Whether the background limit leaves room for one more `soon` or `idle` task. */
    private backgroundRoom(band: GenerationPriority): boolean {
        return (
            band === 'immediate' || this.backgroundLimit === undefined || this.runningBackground < this.backgroundLimit
        );
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
        if (this.running < this.capacity && this.backgroundRoom(priority)) {
            return this.dispatch(task, priority, 0);
        }

        return new Promise<GenerationResult>((resolve, reject) => {
            this.waiting
                .get(priority)!
                .push({ task, enqueuedAt: this.now(), settle: (result) => resolve(result), drop: reject });
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
    private dispatch(
        task: GenerationTask,
        priority: GenerationPriority,
        backlogWaitMs: number
    ): Promise<GenerationResult> {
        this.running++;
        if (priority !== 'immediate') this.runningBackground++;
        const dispatchedAt = this.now();
        const result = this.runner.run(task);
        this.observeWorkerExits();
        const settled = (failed: boolean, reported: GenerationResult | undefined): void => {
            this.stats.record({
                status: task.status,
                priority,
                failed,
                backlogWaitMs,
                turnaroundMs: this.now() - dispatchedAt,
                ...(reported?.workerStats === undefined
                    ? {}
                    : {
                          workerWallMs: reported.workerStats.wallUs / 1000,
                          workerCpuMs: reported.workerStats.cpuUs / 1000
                      })
            });
            this.observeWorkerExits();
            if (priority !== 'immediate') this.runningBackground--;
            this.release();
        };
        // `finally` on its own would make the caller wait for the release, and a rejection here
        // is the caller's to see rather than this one's to handle.
        void result.then(
            (reported) => settled(false, reported),
            () => settled(true, undefined)
        );

        return result;
    }

    /** Attaches cleanup to every worker started by piscina or the embedded runner so far. */
    private observeWorkerExits(): void {
        if (this.options.onWorkerExit === undefined) return;
        for (const candidate of this.runner.threads) {
            if (!(candidate instanceof Worker) || this.observedWorkers.has(candidate)) continue;
            const threadId = candidate.threadId;
            if (threadId < 0) continue;
            this.observedWorkers.add(candidate);
            candidate.once('exit', () => this.options.onWorkerExit?.(threadId));
        }
    }

    /** Lets the highest-priority waiting task through, now that a slot has come free. */
    private release(): void {
        this.running--;
        if (this.closed) return;

        this.startNext();
    }

    /**
     * Dispatches the highest-priority waiting task the background limit allows.
     *
     * @returns False when nothing that may run is waiting.
     */
    private startNext(): boolean {
        for (const band of GENERATION_PRIORITIES) {
            const tasks = this.waiting.get(band)!;
            if (!this.backgroundRoom(band)) continue;
            const next = tasks.shift();
            if (next === undefined) continue;

            next.settle(this.dispatch(next.task, band, this.now() - next.enqueuedAt));
            return true;
        }

        return false;
    }
}
