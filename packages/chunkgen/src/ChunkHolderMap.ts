import { ChunkHolder } from './ChunkHolder';
import type { ProtoChunk } from './ProtoChunk';

/**
 * The holders a generation run is working on, kept alive by reference count.
 *
 * This replaces the generator's 128-entry LRU of neighbor terrain. An LRU is the wrong retention
 * rule here for a reason that is measurable rather than stylistic: `preload-radius: 5` is 121
 * chunks, which sits right at the edge of 128, so a feature pass's write into a neighbor could
 * land on a holder that had already been evicted and silently do nothing. A count answers the
 * question that actually matters, which is whether anything still needs the chunk.
 *
 * Java spends a ticket level on the same job. The shape here is the narrow part of that: a
 * generation task acquires every holder inside its radius before it runs a single step, and
 * releases them all when it finishes, so nothing it depends on can be dropped while it is in
 * flight. A caller that wants a chunk to stay resident past a run acquires its own reference.
 */
export class ChunkHolderMap {
    private readonly holders = new Map<string, ChunkHolder>();

    /**
     * @param newChunk - Allocates the chunk a new holder starts from, called once per holder on
     * its first step. The server passes the dimension's build height through here, and a test
     * passes a short column.
     */
    public constructor(private readonly newChunk: (chunkX: number, chunkZ: number) => ProtoChunk) {}

    /** How many holders are retained. Zero after every task has released what it took. */
    public get size(): number {
        return this.holders.size;
    }

    /** The holder for a chunk, or undefined when nothing retains it. */
    public get(chunkX: number, chunkZ: number): ChunkHolder | undefined {
        return this.holders.get(keyOf(chunkX, chunkZ));
    }

    /** Every retained holder, in the order the holders were created. */
    public values(): IterableIterator<ChunkHolder> {
        return this.holders.values();
    }

    /**
     * Takes a reference on a chunk's holder, creating the holder when this is the first one.
     *
     * @returns The holder, which the caller must release exactly once.
     */
    public acquire(chunkX: number, chunkZ: number): ChunkHolder {
        const key = keyOf(chunkX, chunkZ);
        const existing = this.holders.get(key);
        if (existing !== undefined) return existing.acquire();

        const holder = new ChunkHolder(chunkX, chunkZ, this.newChunk);
        this.holders.set(key, holder);
        return holder.acquire();
    }

    /**
     * Gives back a reference, dropping the holder when it was the last one.
     *
     * @returns Whether the holder was dropped.
     * @throws RangeError when nothing holds a reference on that chunk, which means a task released
     * twice and the next release would drop a holder another task is reading.
     */
    public release(chunkX: number, chunkZ: number): boolean {
        const key = keyOf(chunkX, chunkZ);
        const holder = this.holders.get(key);
        if (holder === undefined) {
            throw new RangeError(`No holder at ${chunkX}, ${chunkZ} to release.`);
        }

        if (holder.release() > 0) return false;
        this.holders.delete(key);
        return true;
    }

    /**
     * Takes a reference on every chunk in the square of `radius` chunks around a center.
     *
     * Java's `ChunkGenerationTask.create` fills a `StaticCache2D` the same way and for the same
     * reason: a task that acquired its neighborhood lazily could find a holder it is about to read
     * dropped by whichever task released last.
     *
     * @returns The holders, row major with x ascending fastest, each owing one release.
     */
    public acquireSquare(centerX: number, centerZ: number, radius: number): readonly ChunkHolder[] {
        const acquired: ChunkHolder[] = [];
        for (let dz = -radius; dz <= radius; dz++) {
            for (let dx = -radius; dx <= radius; dx++) acquired.push(this.acquire(centerX + dx, centerZ + dz));
        }
        return acquired;
    }

    /** Gives back one reference on each of the holders, dropping those that reach zero. */
    public releaseAll(holders: Iterable<ChunkHolder>): void {
        for (const holder of holders) this.release(holder.chunkX, holder.chunkZ);
    }
}

/**
 * The map key for a chunk position.
 *
 * A string rather than a packed number because chunk coordinates run to about 1.9 million in each
 * direction and a 32-bit pair does not fit in a double without losing a bit.
 */
const keyOf = (chunkX: number, chunkZ: number): string => `${chunkX},${chunkZ}`;
