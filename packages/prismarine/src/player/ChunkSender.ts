import Chunk from '../world/chunk/Chunk';

/** A chunk waiting to be sent, with the squared distance that decides its turn. */
interface QueuedChunk {
    x: number;
    z: number;
    priority: number;
}

/**
 * One player's outstanding chunks, nearest first.
 *
 * Chunks are ordered by **squared** distance from the player: comparing squares orders
 * identically to comparing distances, and skips a square root per chunk when a moved player
 * next asks the scheduler for work.
 *
 * The queue does not send anything itself. It is drained by `ChunkScheduler`, which decides
 * how much work a tick may do - that separation is what keeps one player's backlog from
 * becoming everybody's stall.
 */
export class ChunkSender {
    private queue: QueuedChunk[] = [];
    private readonly queued = new Map<number, QueuedChunk>();
    private staleEntries = 0;

    private centerX = 0;
    private centerZ = 0;

    /** Set when the center moves, so the queue is re-sorted once rather than per insert. */
    private dirty = false;

    private static key(x: number, z: number): number {
        // Keep the same exact, world-bounded coordinate key used by World chunk maps.
        return Chunk.packXZ(x, z);
    }

    public get size(): number {
        return this.queued.size;
    }

    public isEmpty(): boolean {
        return this.queued.size === 0;
    }

    public has(x: number, z: number): boolean {
        return this.queued.has(ChunkSender.key(x, z));
    }

    /**
     * Moves the player the queue is centered on.
     *
     * Priorities are recomputed lazily, on the next {@link next}: a player walking produces
     * a position update every tick, and re-sorting on each one would cost more than the
     * sending does.
     */
    public setCenter(chunkX: number, chunkZ: number): void {
        if (chunkX === this.centerX && chunkZ === this.centerZ) return;

        this.centerX = chunkX;
        this.centerZ = chunkZ;
        this.dirty = true;
    }

    /** Adds a chunk, ignoring one already waiting. */
    public enqueue(x: number, z: number): void {
        const key = ChunkSender.key(x, z);
        if (this.queued.has(key)) return;

        const entry = { x, z, priority: this.priorityOf(x, z) };
        this.queued.set(key, entry);
        this.queue.push(entry);
        this.dirty = true;
    }

    /** The next chunk to send, nearest to the player, or null when there is nothing left. */
    public next(): { x: number; z: number } | null {
        if (this.queued.size === 0) return null;

        if (this.dirty) {
            for (const entry of this.queue) {
                if (this.queued.get(ChunkSender.key(entry.x, entry.z)) === entry)
                    entry.priority = this.priorityOf(entry.x, entry.z);
            }
            // Descending, so the nearest chunk is at the end and pop() is O(1).
            this.queue.sort((a, b) => b.priority - a.priority);
            this.dirty = false;
        }

        while (this.queue.length > 0) {
            const entry = this.queue.pop()!;
            const key = ChunkSender.key(entry.x, entry.z);
            if (this.queued.get(key) !== entry) {
                this.staleEntries--;
                continue;
            }

            this.queued.delete(key);
            return { x: entry.x, z: entry.z };
        }

        return null;
    }

    /** Drops a chunk that no longer needs sending, because the player walked away from it. */
    public forget(x: number, z: number): void {
        const key = ChunkSender.key(x, z);
        if (!this.queued.delete(key)) return;

        // Forget is on the player-movement path. Defer array compaction until enough tombstones
        // accumulate so one abandoned chunk does not force a scan of the entire waiting queue.
        this.staleEntries++;
        if (this.staleEntries > Math.max(256, this.queued.size)) {
            this.queue = this.queue.filter((entry) => this.queued.get(ChunkSender.key(entry.x, entry.z)) === entry);
            this.staleEntries = 0;
        }
    }

    public clear(): void {
        this.queue = [];
        this.queued.clear();
        this.staleEntries = 0;
    }

    private priorityOf(x: number, z: number): number {
        const dx = x - this.centerX;
        const dz = z - this.centerZ;

        return dx * dx + dz * dz;
    }
}

export default ChunkSender;
