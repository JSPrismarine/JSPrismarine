/**
 * A pool whose workers each own a part of the world rather than taking whatever comes next.
 *
 * {@link GenerationPool} hands a task to whichever worker is free. That is the right answer for
 * a status that reads nothing outside its own chunk, and the wrong one for a status that reads
 * its neighbors: a worker asked for a chunk whose neighbors it has never seen has to build them
 * first, and with tasks scattered over six workers nearly every chunk is such a chunk. The
 * neighborhood is then built six times over and the pool is slower than one thread.
 *
 * So the routing is positional. The world is cut into square regions and each region belongs to
 * one worker, which means the chunks that share neighbors are asked of the same worker and that
 * worker already has them. Only the regions' edges are built twice.
 *
 * The region size is the whole trade. Large regions duplicate less and spread worse: a view
 * distance that falls inside two of them leaves four workers idle. Small regions spread well and
 * duplicate more, because the halo a region needs is a fixed ring around it and a smaller square
 * has proportionally more edge. {@link DEFAULT_REGION_CHUNKS} is the compromise.
 *
 * Nothing here depends on the routing being stable. A chunk is a pure function of the seed and
 * its position, so which worker built it cannot be observed in the result - which is what lets
 * {@link ShardedGenerationPool.run} send work to an idle worker when its owner is swamped.
 */
import type {
    GenerationPoolOptions,
    GenerationPriority,
    GenerationResult,
    GenerationTask,
    TaskRunnerFactory
} from './GenerationPool';
import { GenerationPool } from './GenerationPool';

/**
 * How wide one region is, in chunks.
 *
 * Eight. A region of 64 chunks needs terrain for the 12 by 12 around it, so it builds 2.25
 * tiles per chunk against the one a single thread would; four would build 4 and sixteen 1.6.
 * Against that, a 10 chunk view distance is 21 by 21, which falls across about nine regions -
 * enough to keep six workers busy, which four hundred chunks in two regions would not.
 */
export const DEFAULT_REGION_CHUNKS = 8;

/**
 * How much longer a worker's queue may be than the shortest before work is sent elsewhere.
 *
 * Without a limit, one player exploring alone would keep one worker busy and five idle, because
 * every chunk they walk into belongs to the same region. With it, the overflow goes to a worker
 * that will have to build the neighborhood itself - slower per chunk, faster in total, and only
 * once the owner is far enough behind for that to be true.
 */
export const DEFAULT_STEAL_AFTER = 2;

/** How a {@link ShardedGenerationPool} is built. */
export interface ShardedGenerationPoolOptions extends GenerationPoolOptions {
    /** How wide one region is, in chunks. Defaults to {@link DEFAULT_REGION_CHUNKS}. */
    readonly regionChunks?: number;
    /**
     * How far behind a region's owner has to fall before its work is given away.
     *
     * Defaults to {@link DEFAULT_STEAL_AFTER}. Zero sends every task to the least loaded
     * worker, which is {@link GenerationPool} with extra steps.
     */
    readonly stealAfter?: number;
}

/**
 * Mixes a region's coordinates and its dimension into a worker index, so neighboring regions
 * rarely share one and the same region of two dimensions rarely does either.
 */
const shardOf = (regionX: number, regionZ: number, dimension: number, shards: number): number => {
    // A multiply-xor-shift over the three inputs. Taking `regionX % shards` directly would put
    // every region of a column on one worker, and a player walking north would use one. The
    // dimension term is zero for the Overworld, which keeps every Overworld region on the
    // worker it had before dimensions entered the hash.
    let hash =
        (Math.imul(regionX, 0x1f1f_1f1f) ^ Math.imul(regionZ, 0x8da6_b343) ^ Math.imul(dimension, 0x9e37_79b9)) | 0;
    hash ^= hash >>> 15;
    hash = Math.imul(hash, 0x2545_f491) | 0;
    hash ^= hash >>> 13;

    return Math.abs(hash) % shards;
};

/**
 * Runs generation tasks in workers that each own a part of the world.
 *
 * The same surface as {@link GenerationPool}, so a caller can hold either.
 */
export class ShardedGenerationPool {
    private readonly shards: readonly GenerationPool[];
    private readonly regionShift: number;
    private readonly stealAfter: number;

    /**
     * Why this process cannot run workers, or undefined when it can.
     *
     * The same question {@link GenerationPool.unavailable} answers, asked of the options every
     * shard is built with.
     *
     * @param options - The options this pool would be built with.
     * @returns A sentence naming what is missing, or undefined when nothing is.
     */
    public static unavailable(options: ShardedGenerationPoolOptions): string | undefined {
        return GenerationPool.unavailable(options);
    }

    /**
     * @param options - The pipeline module, the worker count, the setup and the region size.
     * @param runner - How to build each shard's task runner. Defaults to piscina.
     */
    public constructor(
        public readonly options: ShardedGenerationPoolOptions,
        runner?: TaskRunnerFactory
    ) {
        const region = Math.max(1, Math.trunc(options.regionChunks ?? DEFAULT_REGION_CHUNKS));
        this.regionShift = Math.max(0, Math.round(Math.log2(region)));
        this.stealAfter = Math.max(0, Math.trunc(options.stealAfter ?? DEFAULT_STEAL_AFTER));

        // One worker each, because owning a region is the point and piscina cannot be told
        // which of its threads to use.
        const count = Math.max(1, Math.trunc(options.workers));
        this.shards = Array.from({ length: count }, () =>
            runner === undefined
                ? new GenerationPool({ ...options, workers: 1 })
                : new GenerationPool({ ...options, workers: 1 }, runner)
        );
    }

    /** How many workers are up, across every shard. */
    public get workers(): number {
        return this.shards.reduce((total, shard) => total + shard.workers, 0);
    }

    /** How many tasks the workers are holding right now. */
    public get inFlight(): number {
        return this.shards.reduce((total, shard) => total + shard.inFlight, 0);
    }

    /** How many tasks are waiting for a worker, across every shard and band. */
    public get queued(): number {
        return this.shards.reduce((total, shard) => total + shard.queued, 0);
    }

    /**
     * Runs one task in the worker that owns its region, or in an idle one when that worker is
     * far enough behind.
     *
     * @param task - The status, the position and whatever else the body reads.
     * @param priority - Which band the task waits in. Ordered per worker, because that is where
     * the queue is.
     * @returns What the body produced.
     */
    public async run(task: GenerationTask, priority: GenerationPriority = 'immediate'): Promise<GenerationResult> {
        return this.shardFor(task).run(task, priority);
    }

    /** Drops every waiting task a predicate rejects, in every shard. @returns How many went. */
    public cancel(wanted: (task: GenerationTask) => boolean): number {
        return this.shards.reduce((total, shard) => total + shard.cancel(wanted), 0);
    }

    /** Moves waiting tasks up into a band, in every shard. @returns How many moved. */
    public promote(wanted: (task: GenerationTask) => boolean, to: GenerationPriority): number {
        return this.shards.reduce((total, shard) => total + shard.promote(wanted, to), 0);
    }

    /** Stops every worker of every shard. */
    public async destroy(): Promise<void> {
        await Promise.all(this.shards.map(async (shard) => shard.destroy()));
    }

    /**
     * The worker a task should go to: its region's owner, unless that one is swamped.
     *
     * A region is owned per dimension. Two dimensions sharing one pool would otherwise send
     * both their chunks at (0, 0) to one worker, and a player at each spawn would queue behind
     * the other.
     */
    private shardFor(task: GenerationTask): GenerationPool {
        const owner = shardOf(
            task.chunkX >> this.regionShift,
            task.chunkZ >> this.regionShift,
            task.dimension,
            this.shards.length
        );
        const home = this.shards[owner]!;
        if (this.shards.length === 1) return home;

        const load = (shard: GenerationPool): number => shard.inFlight + shard.queued;
        const homeLoad = load(home);
        if (homeLoad <= this.stealAfter) return home;

        let idlest = home;
        let idlestLoad = homeLoad;
        for (const shard of this.shards) {
            const current = load(shard);
            if (current < idlestLoad) {
                idlest = shard;
                idlestLoad = current;
            }
        }

        // Only when the owner is far enough behind that building the neighborhood a second
        // time is still the faster way to the chunk.
        return homeLoad - idlestLoad > this.stealAfter ? idlest : home;
    }
}
