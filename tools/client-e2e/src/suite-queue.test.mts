import { describe, expect, it } from 'vitest';

import { runQueued } from './suite-queue.mts';

interface Job {
    name: string;
    heavy: boolean;
}

/** Runs `jobs` through the queue, each held for one macrotask, and records starts and overlap. */
const play = async (jobs: Job[], concurrency: number) => {
    const started: string[] = [];
    let heavyRunning = 0;
    let mostHeavy = 0;
    let running = 0;
    let mostRunning = 0;
    const results = await runQueued(
        jobs,
        concurrency,
        (job) => job.heavy,
        async (job, index) => {
            started.push(job.name);
            running++;
            mostRunning = Math.max(mostRunning, running);
            if (job.heavy) heavyRunning++;
            mostHeavy = Math.max(mostHeavy, heavyRunning);
            // Hold the slot long enough for every other worker to try to start something.
            await new Promise<void>((resolve) => setImmediate(resolve));
            if (job.heavy) heavyRunning--;
            running--;
            return `${job.name}@${index}`;
        }
    );
    return { started, mostHeavy, mostRunning, results };
};

describe('runQueued', () => {
    it('never runs two exclusive items at once, and fills the other slot meanwhile', async () => {
        const { started, mostHeavy, mostRunning } = await play(
            [
                { name: 'worldgen-spawn', heavy: true },
                { name: 'worldgen-dimensions', heavy: true },
                { name: 'levels', heavy: false }
            ],
            2
        );

        expect(mostHeavy).toBe(1);
        expect(mostRunning).toBe(2);
        // `levels` jumps the second noise suite instead of waiting behind it.
        expect(started).toEqual(['worldgen-spawn', 'levels', 'worldgen-dimensions']);
    });

    it('starts items in order when none is exclusive', async () => {
        const { started, mostRunning } = await play(
            ['a', 'b', 'c', 'd'].map((name) => ({ name, heavy: false })),
            2
        );

        expect(started).toEqual(['a', 'b', 'c', 'd']);
        expect(mostRunning).toBe(2);
    });

    it('returns each result at its item index and runs every item once', async () => {
        const jobs = [
            { name: 'a', heavy: true },
            { name: 'b', heavy: true },
            { name: 'c', heavy: true },
            { name: 'd', heavy: false }
        ];
        const { results, started, mostHeavy } = await play(jobs, 3);

        expect(results).toEqual(['a@0', 'b@1', 'c@2', 'd@3']);
        expect([...started].sort()).toEqual(['a', 'b', 'c', 'd']);
        expect(mostHeavy).toBe(1);
    });

    it('releases the exclusive slot when an item throws', async () => {
        const ran: string[] = [];
        await expect(
            runQueued(
                ['x', 'y'],
                1,
                () => true,
                async (name) => {
                    ran.push(name);
                    if (name === 'x') throw new TypeError('boom');
                    return name;
                }
            )
        ).rejects.toThrow('boom');
        expect(ran).toEqual(['x']);
    });
});
