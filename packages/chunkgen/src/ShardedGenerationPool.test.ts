/**
 * Where the sharded pool sends each task, driven over doubles.
 *
 * Doubles rather than real threads: what is worth checking is the routing, and with real
 * workers which one answered first would decide the result instead of the rule under test.
 */
import { describe, expect, it } from 'vitest';

import type { GenerationResult, GenerationTask, TaskRunnerFactory } from './GenerationPool';
import { ShardedGenerationPool } from './ShardedGenerationPool';

/** One shard's runner, which records what it was given and finishes when told. */
class ShardRunner {
    public readonly started: GenerationTask[] = [];
    public readonly threads: readonly unknown[] = [{}];

    private readonly finishers: Array<() => void> = [];

    public run(task: GenerationTask): Promise<GenerationResult> {
        this.started.push(task);

        return new Promise<GenerationResult>((resolve) => {
            this.finishers.push(() => resolve({ payload: null, transferList: [] }));
        });
    }

    public finishAll(): void {
        while (this.finishers.length > 0) this.finishers.shift()!();
    }

    public async destroy(): Promise<void> {}
}

/**
 * A pool over one runner per shard, so a test can see which shard got what.
 *
 * `inFlight` is generous by default: a shard that can only hold one task at a time starts one
 * and queues the rest, and a test about routing wants to see where all of them went.
 */
const open = (shards: number, extra: Partial<{ regionChunks: number; stealAfter: number; inFlight: number }> = {}) => {
    const runners: ShardRunner[] = [];
    const factory: TaskRunnerFactory = () => {
        const runner = new ShardRunner();
        runners.push(runner);
        return runner;
    };
    const pool = new ShardedGenerationPool({ pipeline: 'unused', workers: shards, inFlight: 32, ...extra }, factory);

    return { pool, runners };
};

const ask = (pool: ShardedGenerationPool, chunkX: number, chunkZ: number, dimension = 0) =>
    pool.run({ status: 'terrain', chunkX, chunkZ, dimension });

const settle = async (): Promise<void> => {
    for (let turn = 0; turn < 4; turn++) await Promise.resolve();
};

/** Which shard, if any, was given a chunk. */
const shardHolding = (runners: readonly ShardRunner[], chunkX: number, chunkZ: number, dimension = 0): number =>
    runners.findIndex((runner) =>
        runner.started.some((task) => task.chunkX === chunkX && task.chunkZ === chunkZ && task.dimension === dimension)
    );

describe('the sharded generation pool', () => {
    it('sends every chunk of one region to the same worker', async () => {
        const { pool, runners } = open(4, { regionChunks: 8, stealAfter: 1000 });

        // The 8 by 8 region at the origin, corner to corner.
        for (const [x, z] of [
            [0, 0],
            [7, 0],
            [0, 7],
            [7, 7],
            [3, 4]
        ]) {
            void ask(pool, x!, z!);
        }
        await settle();

        const owners = new Set(runners.map((runner, index) => (runner.started.length > 0 ? index : -1)));
        owners.delete(-1);
        expect(owners.size).toBe(1);
    });

    it('keeps a region on its worker across negative coordinates too', async () => {
        const { pool, runners } = open(4, { regionChunks: 8, stealAfter: 1000 });

        // -8..-1 is one region, and an arithmetic shift is what makes that true.
        for (const [x, z] of [
            [-8, -8],
            [-1, -1],
            [-5, -3]
        ]) {
            void ask(pool, x!, z!);
        }
        await settle();

        const owners = runners.filter((runner) => runner.started.length > 0);
        expect(owners).toHaveLength(1);
        expect(owners[0]!.started).toHaveLength(3);
    });

    it('spreads different regions over the workers', async () => {
        const { pool, runners } = open(4, { regionChunks: 8, stealAfter: 1000 });

        // One chunk from each of sixty-four regions, so a routing that collapsed onto one
        // worker, or onto one per column, shows up.
        for (let regionX = 0; regionX < 8; regionX++) {
            for (let regionZ = 0; regionZ < 8; regionZ++) void ask(pool, regionX * 8, regionZ * 8);
        }
        await settle();

        const used = runners.filter((runner) => runner.started.length > 0);
        expect(used).toHaveLength(4);
    });

    it('does not put a whole column of regions on one worker', async () => {
        const { pool, runners } = open(4, { regionChunks: 8, stealAfter: 1000 });

        // Walking north: region x stays put and region z climbs. Taking the coordinate
        // modulo the worker count would use exactly one worker for all of it.
        for (let regionZ = 0; regionZ < 16; regionZ++) void ask(pool, 0, regionZ * 8);
        await settle();

        expect(runners.filter((runner) => runner.started.length > 0).length).toBeGreaterThan(1);
    });

    it('keeps every Overworld region on the worker it had before dimensions entered the hash', async () => {
        const { pool, runners } = open(4, { regionChunks: 8, stealAfter: 1000 });

        // Region coordinates and the shard each one landed on when the hash took only the two
        // coordinates. Dimension 0 contributes nothing to the hash, so Overworld work must not
        // move; a change here redistributes every running server's generation load.
        const pinned: ReadonlyArray<readonly [regionX: number, regionZ: number, shard: number]> = [
            [0, 0, 0],
            [1, 0, 0],
            [0, 1, 2],
            [-1, -1, 0],
            [3, -2, 0],
            [-7, 5, 1],
            [12, 12, 2],
            [100, -100, 1]
        ];
        for (const [regionX, regionZ] of pinned) void ask(pool, regionX * 8, regionZ * 8, 0);
        await settle();

        for (const [regionX, regionZ, shard] of pinned) {
            expect(shardHolding(runners, regionX * 8, regionZ * 8), `region ${regionX}, ${regionZ}`).toBe(shard);
        }
    });

    it('sends the same region of two dimensions to different workers for some positions', async () => {
        const { pool, runners } = open(4, { regionChunks: 8, stealAfter: 1000 });

        // Several regions, each asked for in the Overworld and the Nether. A hash that ignored
        // the dimension would put every pair on one worker.
        const positions = [
            [0, 0],
            [8, 0],
            [0, 8],
            [-8, -8],
            [24, -16]
        ] as const;
        for (const [x, z] of positions) {
            void ask(pool, x, z, 0);
            void ask(pool, x, z, 1);
        }
        await settle();

        let split = 0;
        for (const [x, z] of positions) {
            const overworld = shardHolding(runners, x, z, 0);
            const nether = shardHolding(runners, x, z, 1);
            expect(overworld, `overworld ${x}, ${z}`).toBeGreaterThanOrEqual(0);
            expect(nether, `nether ${x}, ${z}`).toBeGreaterThanOrEqual(0);
            if (overworld !== nether) split++;
        }

        expect(split).toBeGreaterThan(0);
    });

    it('gives work away once a region owner falls far enough behind', async () => {
        const { pool, runners } = open(2, { regionChunks: 8, stealAfter: 1, inFlight: 1 });

        // Everything in one region, so one worker owns all of it.
        for (let chunk = 0; chunk < 6; chunk++) void ask(pool, chunk % 8, 0);
        await settle();

        expect(runners.filter((runner) => runner.started.length > 0)).toHaveLength(2);
    });

    it('keeps a short queue on its owner rather than scattering it', async () => {
        const { pool, runners } = open(4, { regionChunks: 8, stealAfter: 4, inFlight: 1 });

        for (let chunk = 0; chunk < 3; chunk++) void ask(pool, chunk, 0);
        await settle();

        expect(runners.filter((runner) => runner.started.length > 0)).toHaveLength(1);
    });

    it('answers with what the worker produced', async () => {
        const { pool, runners } = open(2, { stealAfter: 1000 });

        const answer = ask(pool, 1, 1);
        await settle();
        for (const runner of runners) runner.finishAll();

        await expect(answer).resolves.toEqual({ payload: null, transferList: [] });
    });

    it('counts what every shard is holding and waiting on', async () => {
        const { pool } = open(2, { regionChunks: 8, stealAfter: 1000, inFlight: 1 });

        for (let chunk = 0; chunk < 4; chunk++) void ask(pool, chunk, 0);
        await settle();

        // One in flight on the owner and three behind it, since `inFlight` is one per shard.
        expect(pool.inFlight).toBe(1);
        expect(pool.queued).toBe(3);
        expect(pool.workers).toBe(2);
    });

    it('cancels and promotes across every shard', async () => {
        const { pool, runners } = open(2, { regionChunks: 8, stealAfter: 1000, inFlight: 1 });

        // One running and three waiting as `idle`, which is what there is to move and drop.
        void pool.run({ status: 'terrain', chunkX: 0, chunkZ: 0, dimension: 0 }).catch(() => {});
        await settle();
        for (const chunkX of [1, 2, 3]) {
            void pool.run({ status: 'terrain', chunkX, chunkZ: 0, dimension: 0 }, 'idle').catch(() => {});
        }
        await settle();

        expect(pool.promote((task) => task.chunkX === 3, 'immediate')).toBe(1);
        expect(pool.cancel((task) => task.chunkX === 2)).toBe(2);
        expect(pool.queued).toBe(1);
        expect(shardHolding(runners, 0, 0)).toBeGreaterThanOrEqual(0);
    });

    it('stops every worker when it is shut down', async () => {
        const { pool } = open(3, { stealAfter: 1000 });

        await expect(pool.destroy()).resolves.toBeUndefined();
    });
});
