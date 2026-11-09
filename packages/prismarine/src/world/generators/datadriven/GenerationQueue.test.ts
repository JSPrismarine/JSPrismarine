import { describe, expect, it } from 'vitest';

import { GenerationStopped } from '../../Generator';
import { GenerationQueue } from './GenerationQueue';

/** A promise with its resolver, so a test decides when a request finishes. */
const deferred = (): { promise: Promise<void>; settle: () => void } => {
    let settle = (): void => {};
    const promise = new Promise<void>((resolve) => {
        settle = resolve;
    });
    return { promise, settle };
};

describe('GenerationQueue', () => {
    it('runs as many as its depth at once and holds the rest', async () => {
        const queue = new GenerationQueue(2);
        const gates = [deferred(), deferred(), deferred()];
        const started: number[] = [];

        const requests = gates.map(async (gate, index) =>
            queue.run(index, 0, async () => {
                started.push(index);
                await gate.promise;
                return index;
            })
        );

        await Promise.resolve();
        expect(started).toEqual([0, 1]);
        expect(queue.inFlight).toBe(2);
        expect(queue.queued).toBe(1);

        gates[0]!.settle();
        await requests[0];
        expect(started).toEqual([0, 1, 2]);

        gates[1]!.settle();
        gates[2]!.settle();
        expect(await Promise.all(requests)).toEqual([0, 1, 2]);
        expect(queue.inFlight).toBe(0);
    });

    it('never admits past its depth, however many arrive between turns', async () => {
        const queue = new GenerationQueue(2);
        const gates = Array.from({ length: 8 }, () => deferred());
        let peak = 0;

        const requests = gates.map(async (gate, index) =>
            queue.run(index, 0, async () => {
                peak = Math.max(peak, queue.inFlight);
                await gate.promise;
            })
        );

        for (const gate of gates) {
            gate.settle();
            await Promise.resolve();
        }

        await Promise.all(requests);
        expect(peak).toBe(2);
    });

    it('refuses what is waiting and lets what is running finish', async () => {
        const queue = new GenerationQueue(1);
        const gate = deferred();
        const running = queue.run(0, 0, async () => {
            await gate.promise;
            return 'built';
        });
        const waiting = queue.run(4, -9, async () => 'never');

        await Promise.resolve();
        queue.stop();
        gate.settle();

        expect(await running).toBe('built');
        await expect(waiting).rejects.toThrow(/4,-9/);
        await expect(waiting).rejects.toBeInstanceOf(GenerationStopped);
    });

    it('reports a build that failed during the shutdown as a refusal', async () => {
        // Stopping terminates the worker threads, and a terminated worker rejects its task with
        // its own error. `World.preloadChunk` catches a refusal and rethrows anything else, so
        // a raw pool failure here would fail the whole start region.
        const queue = new GenerationQueue(1);
        const gate = deferred();
        const running = queue.run(6, -3, async () => {
            await gate.promise;
            throw new Error('Terminating worker thread');
        });

        await Promise.resolve();
        queue.stop();
        gate.settle();

        await expect(running).rejects.toBeInstanceOf(GenerationStopped);
        await expect(running).rejects.toThrow(/6,-3/);
    });

    it('still reports a real failure when nothing is shutting down', async () => {
        const queue = new GenerationQueue(1);

        await expect(
            queue.run(0, 0, async () => {
                throw new RangeError('no terrain here');
            })
        ).rejects.toBeInstanceOf(RangeError);
    });

    it('refuses a request made after the stop', async () => {
        const queue = new GenerationQueue(4);
        queue.stop();

        await expect(queue.run(1, 2, async () => 'never')).rejects.toBeInstanceOf(GenerationStopped);
    });

    it('lets the next request in when one throws', async () => {
        const queue = new GenerationQueue(1);
        const failing = queue.run(0, 0, async () => {
            throw new RangeError('no terrain here');
        });
        const next = queue.run(1, 0, async () => 'built');

        await expect(failing).rejects.toBeInstanceOf(RangeError);
        expect(await next).toBe('built');
        expect(queue.inFlight).toBe(0);
    });

    it('treats a depth below one as one', async () => {
        const queue = new GenerationQueue(0);
        const gate = deferred();
        const first = queue.run(0, 0, async () => {
            await gate.promise;
        });
        let secondStarted = false;
        const second = queue.run(1, 0, async () => {
            secondStarted = true;
        });

        await Promise.resolve();
        expect(secondStarted).toBe(false);

        gate.settle();
        await Promise.all([first, second]);
        expect(secondStarted).toBe(true);
    });

    it('admits the most urgent waiting request first, and the oldest inside a band', async () => {
        const queue = new GenerationQueue(1);
        const gate = deferred();
        const order: string[] = [];
        const ask = async (name: string, x: number, priority: 'immediate' | 'soon' | 'idle') =>
            queue.run(
                x,
                0,
                async () => {
                    order.push(name);
                },
                priority
            );

        const running = queue.run(0, 0, async () => gate.promise);
        const requests = [
            ask('idle-1', 1, 'idle'),
            ask('soon-1', 2, 'soon'),
            ask('idle-2', 3, 'idle'),
            ask('immediate-1', 4, 'immediate'),
            ask('soon-2', 5, 'soon')
        ];
        await Promise.resolve();
        gate.settle();
        await Promise.all([running, ...requests]);

        expect(order).toEqual(['immediate-1', 'soon-1', 'soon-2', 'idle-1', 'idle-2']);
    });

    it('moves a waiting request up when it is promoted, and never down', async () => {
        const queue = new GenerationQueue(1);
        const gate = deferred();
        const order: string[] = [];
        const ask = async (name: string, x: number, priority: 'immediate' | 'soon' | 'idle') =>
            queue.run(x, 0, async () => void order.push(name), priority);

        const running = queue.run(0, 0, async () => gate.promise);
        const requests = [ask('a', 1, 'idle'), ask('b', 2, 'idle'), ask('c', 3, 'soon')];
        await Promise.resolve();

        expect(queue.promote(2, 0, 'immediate')).toBe(true);
        expect(queue.promote(3, 0, 'idle')).toBe(false);
        expect(queue.promote(99, 0, 'immediate')).toBe(false);
        gate.settle();
        await Promise.all([running, ...requests]);

        expect(order).toEqual(['b', 'c', 'a']);
    });
});
