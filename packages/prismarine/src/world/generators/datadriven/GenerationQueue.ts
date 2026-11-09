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
import { GENERATION_PRIORITIES } from '@jsprismarine/chunkgen';
import type { GenerationPriority } from '@jsprismarine/chunkgen';

import { GenerationStopped } from '../../Generator';

/** One request that has not been admitted yet. */
interface Waiting {
    readonly chunkX: number;
    readonly chunkZ: number;
    /** The band it waits in; raised by {@link GenerationQueue.promote}. */
    priority: GenerationPriority;
    /** Lets the request through. */
    readonly admit: () => void;
    /** Refuses it, which is what a shutdown does to everything still here. */
    readonly refuse: (error: Error) => void;
}

/**
 * Admits chunk requests a few at a time and refuses the queue on shutdown.
 *
 * Waiting requests are served by band, `immediate` first, and in arrival order inside a band. A
 * strictly first-come queue let a hundred `idle` rim chunks stand in front of the chunk a player
 * was waiting on, and, with the pool behind it held back, in front of it indefinitely: the tick
 * awaits that chunk, so the server stopped.
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
     * @param priority - The band the request waits in. Defaults to `immediate`.
     * @throws {GenerationStopped} When {@link GenerationQueue.stop} was called before this
     * request's turn came, or when the build failed after it was called, which is what a
     * terminated worker looks like.
     */
    public async run<T>(
        chunkX: number,
        chunkZ: number,
        build: () => Promise<T>,
        priority: GenerationPriority = 'immediate'
    ): Promise<T> {
        if (this.stopped) throw new GenerationStopped(chunkX, chunkZ);
        // A waiter is counted in by whoever admits it, not here: the two are a microtask apart,
        // and counting here would let a request that arrived in between slip past the depth.
        if (this.running >= this.depth) await this.waitForTurn(chunkX, chunkZ, priority);
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

    /**
     * Moves a waiting request up into a band. A request already being served, or already in the
     * band or above it, is left alone.
     *
     * @returns Whether a waiting request moved.
     */
    public promote(chunkX: number, chunkZ: number, to: GenerationPriority): boolean {
        const waiting = this.waiting.find((entry) => entry.chunkX === chunkX && entry.chunkZ === chunkZ);
        if (
            waiting === undefined ||
            GENERATION_PRIORITIES.indexOf(to) >= GENERATION_PRIORITIES.indexOf(waiting.priority)
        ) {
            return false;
        }

        waiting.priority = to;
        return true;
    }

    private waitForTurn(chunkX: number, chunkZ: number, priority: GenerationPriority): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.waiting.push({ chunkX, chunkZ, priority, admit: resolve, refuse: reject });
        });
    }

    private admitNext(): void {
        if (this.stopped || this.running >= this.depth || this.waiting.length === 0) return;

        // The most urgent band first, then the longest waiting inside it.
        let index = 0;
        for (let candidate = 1; candidate < this.waiting.length; candidate++) {
            if (
                GENERATION_PRIORITIES.indexOf(this.waiting[candidate]!.priority) <
                GENERATION_PRIORITIES.indexOf(this.waiting[index]!.priority)
            ) {
                index = candidate;
            }
        }

        this.running++;
        this.waiting.splice(index, 1)[0]!.admit();
    }
}
