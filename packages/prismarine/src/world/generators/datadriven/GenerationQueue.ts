/**
 * How many chunks the generator builds at once, and what a shutdown does to the rest.
 *
 * This replaces the promise tail every request used to chain onto. That tail made the batch of
 * thirty-two the start region asks for strictly sequential, which kept the chunk status ladder's
 * shared-promise path from ever firing in the server and would hold a worker pool at a depth of
 * one however many workers it had.
 *
 * It keeps the one thing the tail was also doing. A request is refused when its turn comes rather
 * than when it was made, so a shutdown lets the chunks already being built finish and drops
 * everything still waiting. That is what takes a cold preload's shutdown from 22.5 seconds to
 * under one: thirty-two requests arrive in a single turn and all but a handful are still here.
 */
import { GenerationStopped } from '../../Generator';

/** One request that has not been admitted yet. */
interface Waiting {
    readonly chunkX: number;
    readonly chunkZ: number;
    /** Lets the request through. */
    readonly admit: () => void;
    /** Refuses it, which is what a shutdown does to everything still here. */
    readonly refuse: (error: Error) => void;
}

/**
 * Admits chunk requests a few at a time and refuses the queue on shutdown.
 *
 * The depth is the number of chunks that may be in flight at once. It is the pool size when the
 * terrain bodies run in workers, because a pool held shallower than its worker count leaves
 * workers idle, and a small number when they run inline, because one thread gains nothing from
 * holding more half-built chunks than it can interleave.
 */
export class GenerationQueue {
    private running = 0;
    private readonly waiting: Waiting[] = [];
    private stopped = false;

    /** @param depth - How many requests may be in flight at once. Clamped to at least one. */
    public constructor(private readonly depth: number) {
        this.depth = Math.max(1, Math.trunc(depth));
    }

    /** How many requests are being served right now. */
    public get inFlight(): number {
        return this.running;
    }

    /** How many requests are waiting for a turn. */
    public get queued(): number {
        return this.waiting.length;
    }

    /**
     * Refuses everything waiting, now and from here on.
     *
     * What is already running is left alone: it holds a half-built chunk, and the cheapest way
     * to a consistent world is to let it finish on this thread. A chunk being built in a worker
     * is a different matter, because stopping a worker means terminating it; that failure comes
     * back through {@link GenerationQueue.run} and is reported as a refusal too.
     */
    public stop(): void {
        this.stopped = true;
        while (this.waiting.length > 0) {
            const next = this.waiting.shift()!;
            next.refuse(new GenerationStopped(next.chunkX, next.chunkZ));
        }
    }

    /**
     * Runs a chunk request, waiting for a turn when the queue is full.
     *
     * @param chunkX - Chunk x, for a refusal to name.
     * @param chunkZ - Chunk z, for a refusal to name.
     * @param build - What to run once the request is admitted.
     * @returns Whatever `build` produced.
     * @throws {GenerationStopped} When {@link GenerationQueue.stop} was called before this
     * request's turn came, or when the build failed after it was called, which is what a
     * terminated worker looks like.
     */
    public async run<T>(chunkX: number, chunkZ: number, build: () => Promise<T>): Promise<T> {
        if (this.stopped) throw new GenerationStopped(chunkX, chunkZ);
        // A waiter is counted in by whoever admits it, not here: the two are a microtask apart,
        // and counting here would let a request that arrived in between slip past the depth.
        if (this.running >= this.depth) await this.waitForTurn(chunkX, chunkZ);
        else this.running++;

        try {
            return await build();
        } catch (error: unknown) {
            // A shutdown terminates the worker threads mid-chunk, and a terminated worker
            // rejects its task with its own error rather than with a refusal. The caller asked
            // a generator that is stopping, so it is told that, instead of being handed a
            // thread pool failure that `World.preloadChunk` would rethrow as a real fault.
            if (this.stopped) throw new GenerationStopped(chunkX, chunkZ);
            throw error;
        } finally {
            this.running--;
            this.admitNext();
        }
    }

    private waitForTurn(chunkX: number, chunkZ: number): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.waiting.push({ chunkX, chunkZ, admit: resolve, refuse: reject });
        });
    }

    private admitNext(): void {
        if (this.stopped || this.running >= this.depth || this.waiting.length === 0) return;

        this.running++;
        this.waiting.shift()!.admit();
    }
}
