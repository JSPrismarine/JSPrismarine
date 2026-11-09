import { describe, expect, it } from 'vitest';

import { ChunkCompletionQueue } from './ChunkCompletionQueue';

describe('ChunkCompletionQueue', () => {
    it('runs immediately until the ticker activates, and settles the callback result', async () => {
        const queue = new ChunkCompletionQueue();
        const order: string[] = [];

        const result = queue.defer(() => {
            order.push('complete');
            return 42;
        });

        expect(order).toEqual(['complete']);
        await expect(result).resolves.toBe(42);
        expect(queue.pending).toBe(0);
    });

    it('holds a completion for a bounded tick drain and records queue age and CPU time', async () => {
        let now = 0;
        const queue = new ChunkCompletionQueue(() => now);
        const order: string[] = [];
        queue.activate();
        const result = queue.defer(
            () => {
                order.push('translated');
                now += 3;
                return 'ready';
            },
            { label: 'worker-result' }
        );
        now = 5;

        expect(queue.snapshot().oldestAgeMs).toBe(5);
        expect(queue.drain(2)).toBe(1); // One synchronous callback may exceed the slice.
        expect(order).toEqual(['translated']);
        await expect(result).resolves.toBe('ready');
        expect(queue.snapshot()).toMatchObject({
            pending: 0,
            enqueued: 1,
            completed: 1,
            cpuMs: 3,
            maxQueueAgeMs: 5,
            maxTaskCpuMs: 3,
            byLabel: { 'worker-result': { completed: 1, cpuMs: 3, maxQueueAgeMs: 5 } }
        });
    });

    it('keeps idle completions progressing during an immediate join burst', () => {
        let now = 0;
        const queue = new ChunkCompletionQueue(() => now);
        const order: string[] = [];
        queue.activate();

        for (let index = 0; index < 12; index++) {
            queue.defer(
                () => {
                    order.push(`immediate-${index}`);
                    now += 1;
                },
                { priority: 'immediate' }
            );
        }
        queue.defer(
            () => {
                order.push('idle-a');
                now += 1;
            },
            { priority: 'idle' }
        );
        queue.defer(
            () => {
                order.push('idle-b');
                now += 1;
            },
            { priority: 'idle' }
        );

        expect(queue.drain(5)).toBe(5);
        expect(order.filter((entry) => entry.startsWith('immediate'))).toHaveLength(4);
        expect(order).toContain('idle-a');
        expect(queue.snapshot().oldestAgeMs).toBe(5);
        expect(queue.drain(5)).toBeGreaterThan(0);
        expect(order).toContain('idle-b');
    });

    it('promotes an in-flight completion when its chunk becomes visible to a player', async () => {
        const queue = new ChunkCompletionQueue();
        const order: string[] = [];
        queue.activate();

        const idle = queue.defer(() => order.push('player chunk'), { priority: 'idle', key: 'overworld:4:-2' });
        for (let index = 0; index < 4; index++) {
            queue.defer(() => order.push(`immediate-${index}`), { priority: 'immediate' });
        }

        expect(queue.promote('overworld:4:-2', 'immediate')).toBe(true);
        expect(queue.promote('overworld:4:-2', 'idle')).toBe(false);
        expect(order).toEqual(['player chunk']);
        expect(queue.pending).toBe(4);
        queue.drain(10);

        await idle;
        expect(order).toEqual(['player chunk', 'immediate-0', 'immediate-1', 'immediate-2', 'immediate-3']);
    });

    it('rejects a failed completion and continues draining the rest', async () => {
        const queue = new ChunkCompletionQueue();
        const order: string[] = [];
        queue.activate();
        const failed = queue.defer(() => {
            throw new Error('bad chunk');
        });
        const next = queue.defer(() => order.push('next'));

        expect(queue.drain(10)).toBe(2);
        await expect(failed).rejects.toThrow('bad chunk');
        await next;
        expect(order).toEqual(['next']);
        expect(queue.snapshot()).toMatchObject({ completed: 2, rejected: 1, pending: 0 });
    });

    it('settles queued completions inline when the ticker stops', async () => {
        const queue = new ChunkCompletionQueue();
        const order: number[] = [];
        queue.activate();
        const results = [0, 1, 2].map((value) => queue.defer(() => order.push(value)));

        queue.deactivate();

        await Promise.all(results);
        expect(order).toEqual([0, 1, 2]);
        expect(queue.isActive).toBe(false);
        expect(queue.pending).toBe(0);
    });

    it('books measured work under its label without counting it as queued work', () => {
        let now = 0;
        const queue = new ChunkCompletionQueue(() => now);

        const value = queue.measure('chunk-register', () => {
            now += 3;
            return 'done';
        });
        queue.record('chunk-entities/wall', 7);

        expect(value).toBe('done');
        const snapshot = queue.snapshot();
        expect(snapshot.byLabel['chunk-register']).toMatchObject({ completed: 1, cpuMs: 3 });
        expect(snapshot.byLabel['chunk-entities/wall']).toMatchObject({ completed: 1, cpuMs: 7 });
        expect(snapshot.completed).toBe(0);
        expect(snapshot.cpuMs).toBe(0);
    });

    it('books the time of work that throws, and lets the error through', () => {
        let now = 0;
        const queue = new ChunkCompletionQueue(() => now);

        expect(() =>
            queue.measure('chunk-lighting', () => {
                now += 2;
                throw new Error('no light');
            })
        ).toThrow('no light');
        expect(queue.snapshot().byLabel['chunk-lighting']!.cpuMs).toBe(2);
    });
});
