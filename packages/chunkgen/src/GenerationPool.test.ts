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
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { GenerationPool, GenerationPoolClosedError } from './GenerationPool';

const FAKE_PIPELINE = fileURLToPath(new URL('../test/fakePipeline.mjs', import.meta.url));

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

afterEach(async () => {
    await pool?.destroy();
    pool = undefined;
});

/** Reads the fixture's four numbers back out of the buffer it moved. */
const readBack = (payload: unknown): { payload: FakePayload; blocks: number[] } => {
    // The fixture's own shape, arriving across a thread boundary the compiler cannot follow.
    const typed = payload as FakePayload;
    return { payload: typed, blocks: [...new Int32Array(typed.blocks)] };
};

describe('GenerationPool', () => {
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
