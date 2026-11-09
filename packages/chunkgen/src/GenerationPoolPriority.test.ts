/**
 * The pool's admission queue, driven over a double rather than real threads.
 *
 * A double here, unlike in `GenerationPool.test.ts`: what is being checked is the order the
 * backlog is released in and when a slot comes free, and real workers would make that a race
 * against whichever thread happened to finish first.
 */
import { describe, expect, it } from 'vitest';

import type { GenerationResult, GenerationTask, TaskRunnerFactory } from './GenerationPool';
import { GenerationCanceledError, GenerationPool, GenerationPoolClosedError } from './GenerationPool';

/** A runner that hands back a handle per task so a test decides when each one finishes. */
class ManualRunner {
    public readonly started: GenerationTask[] = [];
    public readonly threads: readonly unknown[] = [];

    private readonly finishers: Array<() => void> = [];

    public run(task: GenerationTask): Promise<GenerationResult> {
        this.started.push(task);

        return new Promise<GenerationResult>((resolve) => {
            this.finishers.push(() => resolve({ payload: `${task.chunkX},${task.chunkZ}`, transferList: [] }));
        });
    }

    /** Finishes the oldest task that has not finished yet. */
    public finishOne(): void {
        this.finishers.shift()?.();
    }

    public async destroy(): Promise<void> {}
}

/** The chunk x of each task the runner was given, which is how a test names what it sent. */
const startedXs = (runner: ManualRunner): number[] => runner.started.map((task) => task.chunkX);

const open = (workers: number, inFlight?: number): { pool: GenerationPool; runner: ManualRunner } => {
    const runner = new ManualRunner();
    const factory: TaskRunnerFactory = () => runner;
    const pool = new GenerationPool(
        { pipeline: 'unused', workers, ...(inFlight === undefined ? {} : { inFlight }) },
        factory
    );

    return { pool, runner };
};

/** Asks for one chunk, naming the band it waits in. `chunkX` identifies it. */
const ask = (pool: GenerationPool, chunkX: number, priority: Parameters<GenerationPool['run']>[1]) =>
    pool.run({ status: 'terrain', chunkX, chunkZ: 0, dimension: 0 }, priority);

/** Lets every pending microtask run, so a released task reaches the runner. */
const settle = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

describe('the generation pool queue', () => {
    it('holds everything above the in-flight limit back rather than handing it downstream', async () => {
        const { pool, runner } = open(1, 2);

        for (let chunkX = 0; chunkX < 6; chunkX++) void ask(pool, chunkX, 'soon');
        await settle();

        // Two with the runner, four still here: piscina dispatches in arrival order, so a task
        // it already holds can no longer be re-ordered.
        expect(startedXs(runner)).toEqual([0, 1]);
        expect(pool.inFlight).toBe(2);
        expect(pool.queued).toBe(4);
    });

    it('drains the backlog by band, not by arrival', async () => {
        const { pool, runner } = open(1, 1);

        void ask(pool, 0, 'immediate');
        await settle();
        expect(startedXs(runner)).toEqual([0]);

        // Queued behind the running one, deliberately worst-band-first.
        void ask(pool, 1, 'idle');
        void ask(pool, 2, 'soon');
        void ask(pool, 3, 'idle');
        void ask(pool, 4, 'immediate');
        void ask(pool, 5, 'soon');
        await settle();
        expect(startedXs(runner)).toEqual([0]);

        for (let release = 0; release < 5; release++) {
            runner.finishOne();
            await settle();
        }

        // immediate, then the two soon in arrival order, then the two idle in arrival order.
        expect(startedXs(runner)).toEqual([0, 4, 2, 5, 1, 3]);
    });

    it('keeps arrival order inside one band', async () => {
        const { pool, runner } = open(1, 1);

        for (let chunkX = 0; chunkX < 5; chunkX++) void ask(pool, chunkX, 'soon');
        await settle();

        for (let release = 0; release < 4; release++) {
            runner.finishOne();
            await settle();
        }

        expect(startedXs(runner)).toEqual([0, 1, 2, 3, 4]);
    });

    it('releases a waiting task when a running one fails, not only when it succeeds', async () => {
        const runner = {
            threads: [] as readonly unknown[],
            started: [] as GenerationTask[],
            run(task: GenerationTask): Promise<GenerationResult> {
                this.started.push(task);
                return task.chunkX === 0
                    ? Promise.reject(new Error('no'))
                    : Promise.resolve({ payload: 0, transferList: [] });
            },
            async destroy(): Promise<void> {}
        };
        const pool = new GenerationPool({ pipeline: 'unused', workers: 1, inFlight: 1 }, () => runner);

        const failing = ask(pool, 0, 'immediate');
        const behind = ask(pool, 1, 'soon');

        await expect(failing).rejects.toThrow('no');
        await expect(behind).resolves.toBeDefined();
        expect(runner.started.map((task) => task.chunkX)).toEqual([0, 1]);
    });

    it('answers a task that never had to wait without going through the queue', async () => {
        const { pool, runner } = open(4);

        const first = ask(pool, 7, 'idle');
        await settle();

        expect(startedXs(runner)).toEqual([7]);
        runner.finishOne();
        await expect(first).resolves.toMatchObject({ payload: '7,0' });
    });

    describe('cancel', () => {
        it('drops the waiting tasks a predicate rejects and leaves the rest in order', async () => {
            const { pool, runner } = open(1, 1);

            void ask(pool, 0, 'immediate');
            await settle();

            const dropped = ask(pool, 1, 'soon');
            void ask(pool, 2, 'soon');
            const alsoDropped = ask(pool, 3, 'idle');
            await settle();

            expect(pool.cancel((task) => task.chunkX % 2 === 0)).toBe(2);
            await expect(dropped).rejects.toBeInstanceOf(GenerationCanceledError);
            await expect(alsoDropped).rejects.toBeInstanceOf(GenerationCanceledError);
            expect(pool.queued).toBe(1);

            runner.finishOne();
            await settle();
            expect(startedXs(runner)).toEqual([0, 2]);
        });

        it('leaves a task a worker already has, because taking it back means killing the worker', async () => {
            const { pool, runner } = open(1, 1);

            void ask(pool, 0, 'idle');
            await settle();

            expect(pool.cancel(() => false)).toBe(0);
            expect(startedXs(runner)).toEqual([0]);
        });
    });

    describe('promote', () => {
        it('moves a waiting task up and leaves the order inside the band alone', async () => {
            const { pool, runner } = open(1, 1);

            void ask(pool, 0, 'immediate');
            await settle();

            void ask(pool, 1, 'soon');
            void ask(pool, 2, 'idle');
            void ask(pool, 3, 'idle');
            await settle();

            expect(pool.promote((task) => task.chunkX === 3, 'soon')).toBe(1);

            for (let release = 0; release < 3; release++) {
                runner.finishOne();
                await settle();
            }

            // 1 was already waiting in `soon`, so the promoted 3 goes behind it, and 2 is
            // left in `idle` where it was.
            expect(startedXs(runner)).toEqual([0, 1, 3, 2]);
        });

        it('leaves a task that is already in the band or above it', async () => {
            const { pool } = open(1, 1);

            void ask(pool, 0, 'immediate');
            await settle();
            void ask(pool, 1, 'immediate');
            void ask(pool, 2, 'soon');
            await settle();

            expect(pool.promote(() => true, 'soon')).toBe(0);
        });

        it('does nothing to a task a worker already has', async () => {
            const { pool, runner } = open(1, 1);

            void ask(pool, 0, 'idle');
            await settle();

            expect(pool.promote(() => true, 'immediate')).toBe(0);
            expect(startedXs(runner)).toEqual([0]);
        });
    });

    describe('destroy', () => {
        it('refuses the backlog rather than leaving it waiting for a turn that will not come', async () => {
            const { pool } = open(1, 1);

            void ask(pool, 0, 'immediate');
            await settle();
            const waiting = ask(pool, 1, 'soon');

            await pool.destroy();

            await expect(waiting).rejects.toBeInstanceOf(GenerationPoolClosedError);
        });

        it('stops releasing the backlog once it has been shut down', async () => {
            const { pool, runner } = open(1, 1);

            void ask(pool, 0, 'immediate');
            await settle();
            void ask(pool, 1, 'soon').catch(() => {});

            await pool.destroy();
            runner.finishOne();
            await settle();

            expect(startedXs(runner)).toEqual([0]);
        });
    });
});

describe('GenerationPool stats and pause', () => {
    /** A pool whose clock a test advances by hand. */
    const openTimed = (workers: number, inFlight: number) => {
        const runner = new ManualRunner();
        const clock = { ms: 0 };
        const pool = new GenerationPool({ pipeline: 'unused', workers, inFlight, now: () => clock.ms }, () => runner);

        return { pool, runner, clock };
    };

    it('records the backlog wait and turnaround of each task by band', async () => {
        const { pool, runner, clock } = openTimed(1, 1);

        const first = ask(pool, 1, 'idle');
        const second = ask(pool, 2, 'immediate');
        clock.ms = 40;
        runner.finishOne();
        await first;
        await settle();
        clock.ms = 100;
        runner.finishOne();
        await second;

        const stats = pool.statsSnapshot().byTask;
        const idle = stats.find((entry) => entry.priority === 'idle')!;
        const immediate = stats.find((entry) => entry.priority === 'immediate')!;
        expect(idle.backlogWait.totalMs).toBe(0);
        expect(idle.turnaround.totalMs).toBe(40);
        expect(immediate.backlogWait.totalMs).toBe(40);
        expect(immediate.turnaround.totalMs).toBe(60);
    });

    it('counts a rejected task as failed', async () => {
        const runner = {
            threads: [] as readonly unknown[],
            run: () => Promise.reject(new Error('nope')),
            destroy: async () => {}
        };
        const pool = new GenerationPool({ pipeline: 'unused', workers: 1 }, () => runner);

        await expect(ask(pool, 1, 'soon')).rejects.toThrow('nope');
        await settle();
        expect(pool.statsSnapshot().byTask[0]!.failed).toBe(1);
    });

    it('holds the backlog while paused and releases it in band order on resume', async () => {
        const { pool, runner } = openTimed(2, 2);

        pool.pause();
        const idle = ask(pool, 1, 'idle');
        const soon = ask(pool, 2, 'idle');
        await settle();
        expect(pool.paused).toBe(true);
        expect(startedXs(runner)).toEqual([]);
        expect(pool.queued).toBe(2);

        pool.resume();
        await settle();
        expect(startedXs(runner)).toEqual([1, 2]);
        runner.finishOne();
        runner.finishOne();
        await Promise.all([idle, soon]);
    });

    it('holds only idle by default and serves the bands above it, so the tick is not held behind the pause', async () => {
        const { pool, runner } = openTimed(2, 2);

        pool.pause();
        const idle = ask(pool, 1, 'idle');
        const immediate = ask(pool, 2, 'immediate');
        const soon = ask(pool, 3, 'soon');
        await settle();
        expect(startedXs(runner)).toEqual([2, 3]);
        runner.finishOne();
        runner.finishOne();
        await Promise.all([immediate, soon]);
        await settle();
        expect(startedXs(runner)).toEqual([2, 3]);

        pool.resume();
        await settle();
        expect(startedXs(runner)).toEqual([2, 3, 1]);
        runner.finishOne();
        await idle;
    });

    it('holds what a rule names, whatever the band, and lets the rest by', async () => {
        const { pool, runner } = openTimed(2, 2);

        pool.pause((task) => task.chunkX < 3);
        const soon = ask(pool, 1, 'soon');
        const idle = ask(pool, 2, 'idle');
        const immediate = ask(pool, 3, 'immediate');
        await settle();
        expect(startedXs(runner)).toEqual([3]);

        runner.finishOne();
        await immediate;
        pool.resume();
        await settle();
        expect(startedXs(runner)).toEqual([3, 1, 2]);
        runner.finishOne();
        runner.finishOne();
        await Promise.all([soon, idle]);
    });

    it('lets a task already with a worker finish while paused, and starts nothing behind it', async () => {
        const { pool, runner } = openTimed(1, 1);

        const running = ask(pool, 1, 'idle');
        pool.pause();
        const behind = ask(pool, 2, 'idle');
        runner.finishOne();
        await running;
        await settle();
        expect(startedXs(runner)).toEqual([1]);

        pool.resume();
        await settle();
        expect(startedXs(runner)).toEqual([1, 2]);
        runner.finishOne();
        await behind;
    });
});

describe('GenerationPool background limit', () => {
    it('lets only the limit of soon and idle tasks run, and never holds immediate ones', async () => {
        const { pool, runner } = open(4, 4);

        pool.setBackgroundLimit(1);
        const idle1 = ask(pool, 1, 'idle');
        const idle2 = ask(pool, 2, 'idle');
        const soon3 = ask(pool, 3, 'soon');
        const immediate4 = ask(pool, 4, 'immediate');
        await settle();
        // The first background task took the one place; the immediate one is not counted.
        expect(startedXs(runner)).toEqual([1, 4]);

        runner.finishOne();
        await idle1;
        await settle();
        // `soon` outranks the waiting `idle` task for the freed place.
        expect(startedXs(runner)).toEqual([1, 4, 3]);

        pool.setBackgroundLimit(undefined);
        await settle();
        expect(startedXs(runner)).toEqual([1, 4, 3, 2]);
        for (let index = 0; index < 3; index++) runner.finishOne();
        await Promise.all([idle2, soon3, immediate4]);
    });

    it('starts waiting tasks when the limit is raised', async () => {
        const { pool, runner } = open(4, 4);

        pool.setBackgroundLimit(1);
        const first = ask(pool, 1, 'idle');
        const second = ask(pool, 2, 'idle');
        const third = ask(pool, 3, 'idle');
        await settle();
        expect(startedXs(runner)).toEqual([1]);

        pool.setBackgroundLimit(3);
        await settle();
        expect(startedXs(runner)).toEqual([1, 2, 3]);
        for (let index = 0; index < 3; index++) runner.finishOne();
        await Promise.all([first, second, third]);
    });
});
