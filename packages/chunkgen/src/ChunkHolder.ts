import type { ChunkStatus } from './ChunkStatus';
import { isOrAfter, parentOfStatus } from './ChunkStatus';
import type { ChunkStep } from './ChunkStep';
import type { ProtoChunk } from './ProtoChunk';
import type { StagedChunk } from './StagedChunk';

/**
 * Runs one status over a chunk and hands back the chunk at that status.
 *
 * The holder supplies the chunk the status below left and takes whatever comes back, so a body
 * that ran in a worker may return a chunk adopted from a transferred payload rather than the one
 * it was given.
 */
export type ChunkStepBody<TChunk extends StagedChunk = ProtoChunk> = (chunk: TChunk) => TChunk | Promise<TChunk>;

/**
 * Raised when a holder is asked for a status whose parent it has never started.
 *
 * Java throws `IllegalStateException("Unexpected last startedWork status")` from
 * `GenerationChunkHolder.acquireStatusBump` for the same reason: the ladder is climbed one rung at
 * a time, so a request that skips a rung is a scheduler bug rather than a request to catch up.
 */
export class ChunkStepOutOfOrderError extends Error {
    public override name = 'ChunkStepOutOfOrderError';

    public constructor(
        public readonly chunkX: number,
        public readonly chunkZ: number,
        /** The status that was asked for. */
        public readonly requested: ChunkStatus,
        /** The highest status the holder has started, or undefined when it has started none. */
        public readonly started: ChunkStatus | undefined
    ) {
        super(
            `The chunk at ${chunkX}, ${chunkZ} cannot start ${requested}: it has started ` +
                `${started ?? 'no status'}, and a chunk climbs the ladder one rung at a time.`
        );
    }
}

/**
 * Raised when a chunk is read at a status it has not reached.
 *
 * This means the scheduler ran a layer before the layer below it finished. A body that reads a
 * status its own step did not declare raises `ChunkReadOutOfWindowError` instead.
 */
export class ChunkNotReadyError extends Error {
    public override name = 'ChunkNotReadyError';

    public constructor(
        public readonly chunkX: number,
        public readonly chunkZ: number,
        /** The status the reader needs. */
        public readonly requested: ChunkStatus,
        /** The status the chunk has reached, or undefined when no status has run on it. */
        public readonly reached: ChunkStatus | undefined
    ) {
        super(
            `The chunk at ${chunkX}, ${chunkZ} was read at ${requested} while it holds ` + `${reached ?? 'no status'}.`
        );
    }
}

/**
 * One chunk's place in the ladder: the promise each status resolved to, and who still needs it.
 *
 * This is Java's `GenerationChunkHolder`. Two mechanisms carry the whole design.
 *
 * One promise per status, created by the first caller and awaited by every later one, is what
 * makes a (chunk, status) body run exactly once however many requests overlap. Java needs a
 * compare-and-exchange on `startedWork` because several pool threads reach `applyStep` at once;
 * only the thread that owns the holder map touches a holder here, and a map insert cannot be
 * interleaved, so the promise slot does the same job. `startedWork` is kept anyway, because it is
 * what catches a layer loop that skips a rung.
 *
 * A reference count, rather than a cache eviction policy, decides when the holder goes away. Every
 * generation task that needs this chunk inside its radius acquires one and releases it when it
 * finishes, and `ChunkHolderMap` drops the holder at zero. An LRU would evict a chunk a running
 * feature pass is still writing into.
 */
export class ChunkHolder<TChunk extends StagedChunk = ProtoChunk> {
    /** The status whose body has been started, which is Java's `startedWork`. */
    private started: ChunkStatus | undefined;
    /** The status whose body has finished. Reads below `reached` are the ones that are safe. */
    private reached: ChunkStatus | undefined;
    private readonly futures = new Map<ChunkStatus, Promise<TChunk>>();
    private references = 0;
    private chunk: TChunk | undefined;

    /**
     * @param chunkX - Chunk x coordinate.
     * @param chunkZ - Chunk z coordinate.
     * @param newChunk - Allocates the chunk the `empty` status starts from. It is called once, on
     * the first step, so a holder that is acquired and never stepped costs nothing. A server that
     * reads chunks from disk replaces this with the load.
     */
    public constructor(
        public readonly chunkX: number,
        public readonly chunkZ: number,
        private readonly newChunk: (chunkX: number, chunkZ: number) => TChunk
    ) {}

    /** The highest status whose body has finished, or undefined before `empty` has run. */
    public get status(): ChunkStatus | undefined {
        return this.reached;
    }

    /** The highest status whose body has been started, which is at or above {@link status}. */
    public get startedStatus(): ChunkStatus | undefined {
        return this.started;
    }

    /** How many generation tasks still need this chunk. */
    public get referenceCount(): number {
        return this.references;
    }

    /** Whether the chunk's body for `status` has finished. */
    public hasReached(status: ChunkStatus): boolean {
        return this.reached !== undefined && isOrAfter(this.reached, status);
    }

    /** Records that one more task needs this chunk. Pairs with {@link release}. */
    public acquire(): this {
        this.references += 1;
        return this;
    }

    /**
     * Records that one task no longer needs this chunk.
     *
     * @returns The remaining count. At zero the holder is finished with and its map drops it.
     * @throws RangeError when the holder is already unreferenced, which means a task released
     * twice and some other task's holder is about to be dropped out from under it.
     */
    public release(): number {
        if (this.references === 0) {
            throw new RangeError(`The chunk at ${this.chunkX}, ${this.chunkZ} has no reference left to release.`);
        }
        this.references -= 1;
        return this.references;
    }

    /** The promise a status resolved or will resolve to, or undefined when it has not been asked for. */
    public futureFor(status: ChunkStatus): Promise<TChunk> | undefined {
        return this.futures.get(status);
    }

    /**
     * The chunk, having checked that it has reached the status the reader needs.
     *
     * The chunk returned is the live one, so it may be at a status above `status` when another
     * task has already driven it further. That is Java's behavior too: `WorldGenRegion.getChunk`
     * checks the guarantee and then hands over the live `ChunkAccess`. It is also why `features`
     * records its neighbor writes as a patch rather than applying them, which is slice 7.
     *
     * @throws ChunkNotReadyError when the chunk has not reached that status.
     */
    public chunkAt(status: ChunkStatus): TChunk {
        if (this.chunk === undefined || !this.hasReached(status)) {
            throw new ChunkNotReadyError(this.chunkX, this.chunkZ, status, this.reached);
        }
        return this.chunk;
    }

    /**
     * Runs a step on this chunk, or joins the run that is already under way.
     *
     * Java's `GenerationChunkHolder.applyStep`. The first caller for a status creates the promise
     * and `body` runs once; every later caller gets that same promise back and `body` is not
     * called again. The run waits for the parent status's promise first, so two statuses of one
     * chunk are never in flight together.
     *
     * @param step - The rung to climb, which also carries the window the body may read.
     * @param body - What to run, supplied by the caller because the status bodies live outside
     * this package.
     * @returns The chunk at `step.targetStatus`.
     * @throws ChunkStepOutOfOrderError when the holder has not started the parent status.
     */
    public applyStep(step: ChunkStep, body: ChunkStepBody<TChunk>): Promise<TChunk> {
        const shared = this.futures.get(step.targetStatus);
        if (shared !== undefined) return shared;

        this.claim(step.targetStatus);
        const future = this.runStep(step, body);
        this.futures.set(step.targetStatus, future);
        // A layer that is never awaited, because a sibling layer rejected first, would otherwise
        // report an unhandled rejection. The stored promise still rejects for whoever awaits it.
        void future.catch(() => undefined);
        return future;
    }

    /**
     * Moves `startedWork` from the parent status to this one, the way Java's compare-and-exchange
     * does. Reaching here means no promise slot exists yet, so this call is the one that claims
     * the rung.
     */
    private claim(status: ChunkStatus): void {
        const parent = parentOfStatus(status);
        if (this.started !== parent) {
            throw new ChunkStepOutOfOrderError(this.chunkX, this.chunkZ, status, this.started);
        }
        this.started = status;
    }

    private async runStep(step: ChunkStep, body: ChunkStepBody<TChunk>): Promise<TChunk> {
        const parent = parentOfStatus(step.targetStatus);
        if (parent !== undefined) await this.waitFor(parent);

        this.chunk ??= this.newChunk(this.chunkX, this.chunkZ);
        const produced = await body(this.chunk);
        // `ProtoChunk.create` already hands back a chunk at `empty`, and a body that ran in a
        // worker hands back one already at the target. Anything above the target is a body that
        // climbed too far, and `advanceTo` rejects it.
        if (produced.status !== step.targetStatus) produced.advanceTo(step.targetStatus);
        this.chunk = produced;
        this.reached = step.targetStatus;
        return produced;
    }

    private waitFor(status: ChunkStatus): Promise<TChunk> {
        const future = this.futures.get(status);
        // Unreachable while `claim` guards every entry: the parent was claimed before this status
        // could be, and claiming a status stores its promise in the same turn.
        if (future === undefined) throw new ChunkStepOutOfOrderError(this.chunkX, this.chunkZ, status, this.started);
        return future;
    }
}
