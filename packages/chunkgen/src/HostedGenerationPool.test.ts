/**
 * The host process, driven over a real child.
 *
 * Real processes for the same reason `GenerationPool.test.ts` uses real threads: what is worth
 * checking belongs to the boundary. That the answer is the same through both transports, that a
 * host killed mid-task is replaced and the task retried to the same bytes, that the host's
 * priority really is lowered, that a host that cannot start hands its work to the in-process
 * pool, and that nothing is left running afterwards.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os, { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { createGenerationTransport } from './createGenerationTransport';
import { GenerationCanceledError, GenerationPool } from './GenerationPool';
import type { GenerationResult } from './GenerationPool';
import type { GenerationTransport } from './GenerationTransport';
import { HostedGenerationPool } from './HostedGenerationPool';
import { decodeShared, encodeShared } from './hostProtocol';

const FAKE_PIPELINE = fileURLToPath(new URL('../test/fakePipeline.mjs', import.meta.url));

const opened: GenerationTransport[] = [];
const track = <T extends GenerationTransport>(transport: T): T => {
    opened.push(transport);
    return transport;
};

afterEach(async () => {
    await Promise.all(opened.splice(0).map(async (transport) => transport.destroy()));
});

/** The bytes a fixture result carries, which is what a digest would hash. */
const bytesOf = (result: GenerationResult): number[] => {
    // The fixture's own shape, arriving across a boundary the compiler cannot follow.
    const payload = result.payload as { blocks: ArrayBuffer; status: string };
    return [...new Int32Array(payload.blocks)];
};

const GRID = Array.from({ length: 12 }, (_unused, index) => [index % 4, Math.trunc(index / 4)] as const);

const runGrid = async (transport: GenerationTransport, order: readonly (readonly [number, number])[]) =>
    Promise.all(
        order.map(async ([chunkX, chunkZ]) => ({
            key: `${chunkX},${chunkZ}`,
            bytes: bytesOf(
                await transport.run({ status: 'terrain', chunkX, chunkZ, dimension: 0, input: chunkX + chunkZ })
            )
        }))
    );

describe('HostedGenerationPool', () => {
    it('gives the same bytes through the host as through the in-process pool, in any order', async () => {
        const hosted = track(new HostedGenerationPool({ pipeline: FAKE_PIPELINE, workers: 2, setup: { seed: 7 } }));
        const local = track(new GenerationPool({ pipeline: FAKE_PIPELINE, workers: 2, setup: { seed: 7 } }));

        const viaHost = await runGrid(hosted, GRID);
        const viaLocal = await runGrid(local, [...GRID].reverse());

        const byKey = (rows: typeof viaHost) => Object.fromEntries(rows.map((row) => [row.key, row.bytes]));
        expect(byKey(viaHost)).toEqual(byKey(viaLocal));
        expect(hosted.hostPid).toBeTypeOf('number');
    }, 60_000);

    it('runs the host at a lowered operating system priority', async () => {
        const hosted = track(new HostedGenerationPool({ pipeline: FAKE_PIPELINE, workers: 1 }));
        await hosted.run({ status: 'terrain', chunkX: 0, chunkZ: 0, dimension: 0 });

        expect(hosted.priorityLowered).toBe(true);
        // Windows has no nice value to read back; elsewhere it is the priority class mapped to one.
        if (process.platform !== 'win32') expect(os.getPriority(hosted.hostPid!)).toBeGreaterThan(0);
        expect(os.getPriority(process.pid)).toBe(0);
    }, 60_000);

    it('replaces a host killed mid-task and retries the task to the same bytes', async () => {
        const expected = bytesOf(
            await track(new GenerationPool({ pipeline: FAKE_PIPELINE, workers: 1, setup: { spinMs: 400 } })).run({
                status: 'terrain',
                chunkX: 3,
                chunkZ: 4,
                dimension: 0
            })
        );
        const hosted = track(new HostedGenerationPool({ pipeline: FAKE_PIPELINE, workers: 1, setup: { spinMs: 400 } }));
        // Starts the host and builds its worker before the kill, so the kill lands inside a task.
        await hosted.run({ status: 'terrain', chunkX: 0, chunkZ: 0, dimension: 0 });
        const firstPid = hosted.hostPid!;

        const pending = hosted.run({ status: 'terrain', chunkX: 3, chunkZ: 4, dimension: 0 });
        await new Promise((resolve) => setTimeout(resolve, 150));
        process.kill(firstPid, 'SIGKILL');

        expect(bytesOf(await pending)).toEqual(expected);
        expect(hosted.hostPid).not.toBe(firstPid);
        expect(hosted.usingFallback).toBe(false);
    }, 60_000);

    it('runs a task submitted during a restart once on the replacement', async () => {
        const logFile = join(mkdtempSync(join(tmpdir(), 'jsp-host-')), 'runs.log');
        const hosted = track(
            new HostedGenerationPool({ pipeline: FAKE_PIPELINE, workers: 1, setup: { spinMs: 300, logFile } })
        );
        await hosted.run({ status: 'terrain', chunkX: 0, chunkZ: 0, dimension: 0 });

        const first = hosted.run({ status: 'terrain', chunkX: 1, chunkZ: 0, dimension: 0 });
        await new Promise((resolve) => setTimeout(resolve, 100));
        process.kill(hosted.hostPid!, 'SIGKILL');
        // Asked for while the replacement is still starting.
        await new Promise((resolve) => setTimeout(resolve, 20));
        const second = hosted.run({ status: 'terrain', chunkX: 2, chunkZ: 0, dimension: 0 });
        await Promise.all([first, second]);

        const started = readFileSync(logFile, 'utf8').trim().split('\n').map(Number);
        const count = (x: number) => started.filter((value) => value === x).length;
        // The first task started on the old host and again on the new one; the second only on the new one.
        expect(count(1)).toBe(2);
        expect(count(2)).toBe(1);
        rmSync(dirname(logFile), { recursive: true, force: true });
    }, 60_000);

    it('runs in process and says why when the host cannot start', async () => {
        const reasons: string[] = [];
        const hosted = track(
            new HostedGenerationPool({
                pipeline: FAKE_PIPELINE,
                workers: 1,
                hostEntry: fileURLToPath(new URL('../test/exitPipeline.mjs', import.meta.url)),
                onFallback: (reason) => reasons.push(reason)
            })
        );

        const result = await hosted.run({ status: 'terrain', chunkX: 1, chunkZ: 2, dimension: 0 });

        expect(bytesOf(result).slice(0, 2)).toEqual([1, 2]);
        expect(hosted.usingFallback).toBe(true);
        expect(reasons).toHaveLength(1);
    }, 60_000);

    it('drops a waiting task on cancel and keeps the class of the refusal', async () => {
        const hosted = track(
            new HostedGenerationPool({ pipeline: FAKE_PIPELINE, workers: 1, inFlight: 1, setup: { spinMs: 300 } })
        );
        await hosted.run({ status: 'terrain', chunkX: 0, chunkZ: 0, dimension: 0 });

        const running = hosted.run({ status: 'terrain', chunkX: 1, chunkZ: 0, dimension: 0 }, 'idle');
        const waiting = hosted.run({ status: 'terrain', chunkX: 2, chunkZ: 0, dimension: 0 }, 'idle');
        const rejected = expect(waiting).rejects.toBeInstanceOf(GenerationCanceledError);
        await new Promise((resolve) => setTimeout(resolve, 100));
        hosted.cancel((task) => task.chunkX !== 2);

        await rejected;
        await expect(running).resolves.toBeDefined();
    }, 60_000);

    it('holds back the tasks a pause names, sends the rest, and releases them on resume', async () => {
        const hosted = track(new HostedGenerationPool({ pipeline: FAKE_PIPELINE, workers: 1 }));
        await hosted.run({ status: 'terrain', chunkX: 0, chunkZ: 0, dimension: 0 });

        hosted.pause((task) => task.chunkX >= 10);
        const held = hosted.run({ status: 'terrain', chunkX: 10, chunkZ: 0, dimension: 0 }, 'idle');
        const free = await hosted.run({ status: 'terrain', chunkX: 1, chunkZ: 0, dimension: 0 }, 'idle');
        expect(bytesOf(free)[0]).toBe(1);
        let settled = false;
        void held.then(() => {
            settled = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(settled).toBe(false);

        hosted.resume();
        expect(bytesOf(await held)[0]).toBe(10);
    }, 60_000);

    it('drops a held task on cancel without asking the host', async () => {
        const hosted = track(new HostedGenerationPool({ pipeline: FAKE_PIPELINE, workers: 1 }));
        hosted.pause(() => true);
        const held = hosted.run({ status: 'terrain', chunkX: 5, chunkZ: 5, dimension: 0 }, 'idle');
        const rejected = expect(held).rejects.toBeInstanceOf(GenerationCanceledError);

        expect(hosted.cancel(() => false)).toBe(1);
        await rejected;
    }, 60_000);

    it('leaves no host process behind after destroy', async () => {
        const hosted = new HostedGenerationPool({ pipeline: FAKE_PIPELINE, workers: 1 });
        await hosted.run({ status: 'terrain', chunkX: 0, chunkZ: 0, dimension: 0 });
        const pid = hosted.hostPid!;

        await hosted.destroy();

        expect(() => process.kill(pid, 0)).toThrow();
    }, 60_000);
});

describe('createGenerationTransport', () => {
    it('builds an in-process pool when asked to, and a host otherwise', async () => {
        const local = createGenerationTransport({ pipeline: FAKE_PIPELINE, workers: 1, host: 'in-process' });
        const hosted = createGenerationTransport({ pipeline: FAKE_PIPELINE, workers: 1, host: 'process' });
        track(local.transport);
        track(hosted.transport);

        expect(local.mode).toBe('in-process');
        expect(hosted.mode).toBe('process');
    });

    it('says why when the pipeline is not on disk', () => {
        const reasons: string[] = [];
        const built = createGenerationTransport({
            pipeline: '/nowhere/pipeline.mjs',
            workers: 1,
            host: 'process',
            onFallback: (reason) => reasons.push(reason)
        });
        track(built.transport);

        expect(built.mode).toBe('in-process');
        expect(built.reason).toContain('not on disk');
        expect(reasons).toEqual([built.reason]);
    });
});

describe('shared buffer encoding', () => {
    it('puts shared buffers back into shared memory after a trip through plain bytes', () => {
        const shared = new SharedArrayBuffer(4);
        new Uint8Array(shared).set([1, 2, 3, 4]);
        const setup = { carve: true, bundle: shared, tables: new Map([['plains', shared]]), list: [shared] };

        const encoded = encodeShared(setup) as typeof setup;
        expect(encoded.bundle).not.toBeInstanceOf(SharedArrayBuffer);
        const decoded = decodeShared(structuredClone(encoded)) as typeof setup;

        expect(decoded.carve).toBe(true);
        expect(decoded.bundle).toBeInstanceOf(SharedArrayBuffer);
        expect([...new Uint8Array(decoded.bundle)]).toEqual([1, 2, 3, 4]);
        expect([...new Uint8Array(decoded.tables.get('plains')!)]).toEqual([1, 2, 3, 4]);
        expect([...new Uint8Array(decoded.list[0]!)]).toEqual([1, 2, 3, 4]);
        expect(decoded.bundle).not.toBe(shared);
    });
});
