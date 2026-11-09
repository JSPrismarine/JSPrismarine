/**
 * The pool, driven over real worker threads.
 *
 * Real threads rather than a double, because everything worth checking here is a property of the
 * boundary: that the pipeline is built once per worker and not once per task, that a buffer
 * arrives moved rather than copied, that a body that throws rejects its task instead of leaving
 * it outstanding, and that the answer does not depend on which worker ran which chunk.
 *
 * The pipeline module is a plain `.mjs` fixture under `test/`, because a worker imports it
 * through Node rather than through the bundler and a dev checkout resolves `@jsprismarine/*` to
 * TypeScript. The worker entry itself is this package's own, which Node loads from source.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { GenerationPool, GenerationPoolClosedError, workerExecArgv } from './GenerationPool';

const FAKE_PIPELINE = fileURLToPath(new URL('../test/fakePipeline.mjs', import.meta.url));
const EXIT_PIPELINE = fileURLToPath(new URL('../test/exitPipeline.mjs', import.meta.url));

/** What the fixture answers with. */
interface FakePayload {
    readonly status: string;
    readonly threadId: number;
    readonly built: number;
    readonly blocks: ArrayBuffer;
}

const open = (workers: number, setup?: unknown): GenerationPool =>
    new GenerationPool({ pipeline: FAKE_PIPELINE, workers, ...(setup === undefined ? {} : { setup }) });

let pool: GenerationPool | undefined;
let snapshotDirectory: string | undefined;

afterEach(async () => {
    await pool?.destroy();
    pool = undefined;
    if (snapshotDirectory !== undefined) rmSync(snapshotDirectory, { recursive: true, force: true });
    snapshotDirectory = undefined;
});

/** Reads the fixture's four numbers back out of the buffer it moved. */
const readBack = (payload: unknown): { payload: FakePayload; blocks: number[] } => {
    // The fixture's own shape, arriving across a thread boundary the compiler cannot follow.
    const typed = payload as FakePayload;
    return { payload: typed, blocks: [...new Int32Array(typed.blocks)] };
};

describe('GenerationPool', () => {
    it('starts without workers, starts one for the first task, and keeps it warm', async () => {
        pool = open(1);

        expect(pool.workers).toBe(0);

        await pool.run({ status: 'terrain', chunkX: 0, chunkZ: 0, dimension: 0 });
        expect(pool.workers).toBe(1);

        await pool.run({ status: 'terrain', chunkX: 1, chunkZ: 0, dimension: 0 });
        expect(pool.workers).toBe(1);
    }, 60_000);

    it('runs a bundled worker entry from a data URL', async () => {
        const source = [
            "import { parentPort } from 'node:worker_threads';",
            "parentPort.on('message', ({ id, task }) => {",
            '    const blocks = new Int32Array([task.chunkX, task.chunkZ]).buffer;',
            '    const result = { payload: { chunkX: task.chunkX, chunkZ: task.chunkZ, blocks }, transferList: [blocks] };',
            '    parentPort.postMessage({ id, ok: true, result }, [blocks]);',
            '});'
        ].join('\n');
        const worker = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
        pool = new GenerationPool({ pipeline: FAKE_PIPELINE, worker, workers: 1 });

        const result = await pool.run({ status: 'terrain', chunkX: 12, chunkZ: -4, dimension: 0 });

        expect(new Int32Array(result.transferList[0]!)).toEqual(new Int32Array([12, -4]));
    }, 60_000);

    it('reports per-worker heap when the benchmark buffer is requested', async () => {
        const buffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
        const stats = new Int32Array(buffer);
        pool = new GenerationPool({ pipeline: FAKE_PIPELINE, workers: 1, workerHeapStats: buffer });

        await pool.run({ status: 'terrain', chunkX: 0, chunkZ: 0, dimension: 0 });

        expect(Atomics.load(stats, 0)).toBe(1);
        expect(Atomics.load(stats, 1)).toBeGreaterThan(0);
    }, 60_000);

    it('reports first-task wall and thread CPU time when the benchmark buffer is requested', async () => {
        const buffer = new SharedArrayBuffer(BigInt64Array.BYTES_PER_ELEMENT * 4);
        const stats = new BigInt64Array(buffer);
        pool = new GenerationPool({ pipeline: FAKE_PIPELINE, workers: 1, workerStartupStats: buffer });

        await pool.run({ status: 'terrain', chunkX: 0, chunkZ: 0, dimension: 0 });

        expect(Atomics.load(stats, 0)).toBe(1n);
        expect(Atomics.load(stats, 1)).toBeGreaterThan(0n);
        expect(Atomics.load(stats, 2)).toBeGreaterThan(0n);
        expect(Atomics.load(stats, 3)).toBeGreaterThan(0n);
    }, 60_000);

    it('reports the worker thread ID when a task exits its worker unexpectedly', async () => {
        let notifyExit!: (threadId: number) => void;
        const exited = new Promise<number>((resolve) => {
            notifyExit = resolve;
        });
        pool = new GenerationPool({
            pipeline: EXIT_PIPELINE,
            workers: 1,
            onWorkerExit: notifyExit
        });

        await expect(
            pool.run({ status: 'terrain', chunkX: 0, chunkZ: 0, dimension: 0, input: 'exit' })
        ).rejects.toThrow();

        await expect(exited).resolves.toBeGreaterThan(0);
    }, 60_000);

    it('writes one worker heap snapshot after its first task when a directory is requested', async () => {
        snapshotDirectory = mkdtempSync(join(tmpdir(), 'jsp-worker-heap-snapshot-'));
        pool = new GenerationPool({
            pipeline: FAKE_PIPELINE,
            workers: 1,
            workerHeapSnapshotDirectory: snapshotDirectory
        });

        await pool.run({ status: 'terrain', chunkX: 0, chunkZ: 0, dimension: 0 });
        await pool.run({ status: 'terrain', chunkX: 1, chunkZ: 0, dimension: 0 });

        const snapshots = readdirSync(snapshotDirectory).filter((entry) => /^worker-\d+\.heapsnapshot$/.test(entry));
        expect(snapshots).toHaveLength(1);
    }, 60_000);

    it('runs a status body in a worker and moves the result back', async () => {
        pool = open(1, { seed: 1234 });

        const result = await pool.run({ status: 'terrain', chunkX: 3, chunkZ: -14, dimension: 0, input: 7 });
        const { payload, blocks } = readBack(result.payload);

        expect(payload.status).toBe('terrain');
        expect(payload.threadId).not.toBe(0);
        expect(blocks).toEqual([3, -14, 1234, 7]);
        expect(result.payload).not.toBe(undefined);
    }, 60_000);

    it('builds the pipeline once per worker, not once per task', async () => {
        pool = open(1, { seed: 1 });

        const runs = await Promise.all(
            Array.from({ length: 6 }, async (_entry, index) =>
                pool!.run({ status: 'terrain', chunkX: index, chunkZ: 0, dimension: 0 })
            )
        );

        // The fixture counts the factory calls its closure has seen. One worker, one build.
        expect(runs.map((run) => readBack(run.payload).payload.built)).toEqual([1, 1, 1, 1, 1, 1]);
    }, 60_000);

    it('gives the same answer whatever worker count and whatever order the chunks arrive in', async () => {
        const positions = Array.from({ length: 24 }, (_entry, index) => [index % 6, Math.trunc(index / 6)] as const);
        const digests: string[] = [];

        for (const workers of [1, 2, 4, 6]) {
            const run = open(workers, { seed: 42 });
            try {
                // A different order each time, so a result that depended on arrival order would
                // land somewhere different in the sorted digest.
                const order = workers % 2 === 0 ? [...positions].reverse() : positions;
                const answers = await Promise.all(
                    order.map(async ([chunkX, chunkZ]) => {
                        const result = await run.run({ status: 'terrain', chunkX, chunkZ, dimension: 0 });
                        return readBack(result.payload).blocks.join(',');
                    })
                );
                digests.push([...answers].sort().join('|'));
            } finally {
                await run.destroy();
            }
        }

        expect(new Set(digests).size).toBe(1);
    }, 120_000);

    it('spreads work over every worker it was asked for', async () => {
        pool = open(4);

        const runs = await Promise.all(
            Array.from({ length: 48 }, async (_entry, index) =>
                pool!.run({ status: 'terrain', chunkX: index, chunkZ: 0, dimension: 0 })
            )
        );

        expect(pool.workers).toBe(4);
        expect(new Set(runs.map((run) => readBack(run.payload).payload.threadId)).size).toBeGreaterThan(1);
    }, 60_000);

    it('rejects the task when a body throws, rather than leaving it outstanding', async () => {
        pool = open(1, { fail: 'task' });

        await expect(pool.run({ status: 'terrain', chunkX: 2, chunkZ: 5, dimension: 0 })).rejects.toThrow(
            /no terrain at 2, 5/
        );
    }, 60_000);

    it('rejects the task when the pipeline module cannot be built', async () => {
        pool = open(1, { fail: 'setup' });

        await expect(pool.run({ status: 'terrain', chunkX: 0, chunkZ: 0, dimension: 0 })).rejects.toThrow(
            /refuses to be built/
        );
    }, 60_000);

    it('rejects the task when the module named is not a pipeline module', async () => {
        pool = new GenerationPool({
            pipeline: fileURLToPath(new URL('../test/notAPipeline.mjs', import.meta.url)),
            workers: 1
        });

        await expect(pool.run({ status: 'terrain', chunkX: 0, chunkZ: 0, dimension: 0 })).rejects.toThrow(
            /does not export createGenerationPipeline/
        );
    }, 60_000);

    it('refuses work once it has been shut down, and says which chunk', async () => {
        const closing = open(1);
        await closing.run({ status: 'terrain', chunkX: 0, chunkZ: 0, dimension: 0 });
        await closing.destroy();

        await expect(closing.run({ status: 'terrain', chunkX: 9, chunkZ: -1, dimension: 0 })).rejects.toBeInstanceOf(
            GenerationPoolClosedError
        );
        expect(closing.workers).toBe(0);
        // Shutting down twice is what a world closing behind a server shutdown does.
        await expect(closing.destroy()).resolves.toBeUndefined();
    }, 60_000);

    describe('unavailable', () => {
        it('says nothing when both files are on disk', () => {
            expect(GenerationPool.unavailable({ pipeline: FAKE_PIPELINE, workers: 1 })).toBe(undefined);
        });

        it('names the pipeline module when it is not on disk', () => {
            const reason = GenerationPool.unavailable({ pipeline: '/nowhere/terrainPipeline.js', workers: 1 });

            expect(reason).toMatch(/pipeline module \/nowhere\/terrainPipeline\.js is not on disk/);
        });

        it('names the worker entry when it is not on disk', () => {
            const reason = GenerationPool.unavailable({
                pipeline: FAKE_PIPELINE,
                worker: '/nowhere/generationWorker.js',
                workers: 1
            });

            expect(reason).toMatch(/worker entry \/nowhere\/generationWorker\.js is not on disk/);
        });

        it('leaves a bare specifier to the loader rather than looking for a file', () => {
            expect(GenerationPool.unavailable({ pipeline: 'some-package/pipeline', workers: 1 })).toBe(undefined);
        });

        it('reads a file URL as the file it names', () => {
            const url = new URL('../test/fakePipeline.mjs', import.meta.url).href;

            expect(GenerationPool.unavailable({ pipeline: url, workers: 1 })).toBe(undefined);
        });
    });

    it('refuses Math.random inside a worker', async () => {
        pool = new GenerationPool({
            pipeline: fileURLToPath(new URL('../test/randomPipeline.mjs', import.meta.url)),
            workers: 1
        });

        await expect(pool.run({ status: 'terrain', chunkX: 0, chunkZ: 0, dimension: 0 })).rejects.toThrow(
            /seeded per V8 isolate/
        );
    }, 60_000);
});

describe('workerExecArgv', () => {
    const bare = { execArgv: ['--max-old-space-size=4096'], nodeOptions: '' };

    it('lets a worker inherit the host flags for a built pipeline', () => {
        expect(workerExecArgv({ pipeline: FAKE_PIPELINE, worker: '/somewhere/generationWorker.js' }, bare)).toBe(
            undefined
        );
    });

    it('lets a worker inherit a loader the host was started with', () => {
        const pipeline = '/checkout/packages/prismarine/src/chunkPipeline.ts';

        expect(workerExecArgv({ pipeline }, { execArgv: ['--import', 'tsx'], nodeOptions: '' })).toBe(undefined);
        expect(workerExecArgv({ pipeline }, { execArgv: ['--import=tsx'], nodeOptions: '' })).toBe(undefined);
        expect(workerExecArgv({ pipeline }, { execArgv: [], nodeOptions: '--import tsx' })).toBe(undefined);
        expect(workerExecArgv({ pipeline }, { execArgv: ['--experimental-transform-types'], nodeOptions: '' })).toBe(
            undefined
        );
    });

    it('hands a worker the tsx the pipeline package declares, after a CommonJS preload', () => {
        // A `.ts` in the sibling package that declares `tsx`, which is the checkout this is for.
        // The preload is how vitest starts a fork, and it is not an ES module loader.
        const pipeline = fileURLToPath(new URL('../../prismarine/src/world/pipeline.ts', import.meta.url));
        const flags = workerExecArgv(
            { pipeline },
            { execArgv: ['--require', '/suppress-warnings.cjs'], nodeOptions: '' }
        );

        expect(flags?.slice(0, 2)).toEqual(['--require', '/suppress-warnings.cjs']);
        expect(flags?.at(-2)).toBe('--import');
        expect(flags?.at(-1)).toMatch(/^file:.*\/tsx\/dist\/loader\.mjs$/);
    });
});

describe('GenerationPool timing over real workers', () => {
    it("reports each worker task's own wall and CPU time", async () => {
        pool = open(1, { spinMs: 40 });

        await pool.run({ status: 'terrain', chunkX: 0, chunkZ: 0, dimension: 0 });

        const entry = pool.statsSnapshot().byTask[0]!;
        expect(entry.workerWall.count).toBe(1);
        expect(entry.workerWall.totalMs).toBeGreaterThanOrEqual(35);
        // A spinning thread is on a CPU for most of its wall time, even on a busy host.
        expect(entry.workerCpu.totalMs).toBeGreaterThan(5);
        expect(entry.workerCpu.totalMs).toBeLessThanOrEqual(entry.workerWall.totalMs + 5);
    }, 60_000);

    it(
        'measures the wait behind a blocking task where it happens',
        { tags: ['performance'] },
        async () => {
            const injectedMs = 300;
            pool = new GenerationPool({
                pipeline: FAKE_PIPELINE,
                workers: 1,
                inFlight: 1,
                setup: { spinMs: injectedMs }
            });
            // Starts the worker and pays its startup before anything is measured.
            await pool.run({ status: 'terrain', chunkX: 0, chunkZ: 0, dimension: 0 });
            pool.resetStats();

            const blocking = pool.run({ status: 'terrain', chunkX: 1, chunkZ: 0, dimension: 0 }, 'idle');
            const next = pool.run({ status: 'terrain', chunkX: 2, chunkZ: 0, dimension: 0 }, 'immediate');
            await Promise.all([blocking, next]);

            const immediate = pool.statsSnapshot().byTask.find((entry) => entry.priority === 'immediate')!;
            expect(immediate.backlogWait.totalMs).toBeGreaterThan(injectedMs * 0.8);
            expect(immediate.backlogWait.totalMs).toBeLessThan(injectedMs * 1.6);
        },
        60_000
    );
});
