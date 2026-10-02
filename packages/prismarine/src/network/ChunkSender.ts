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
 * identically to comparing distances, and skips a square root per chunk on a list that is
 * re-sorted every time the player moves.
 *
 * The queue does not send anything itself. It is drained by `ChunkScheduler`, which decides
 * how much work a tick may do - that separation is what keeps one player's backlog from
 * becoming everybody's stall.
 */
export class ChunkSender {
    private queue: QueuedChunk[] = [];
    private readonly queued = new Set<bigint>();

    private centerX = 0;
    private centerZ = 0;

    /** Set when the centre moves, so the queue is re-sorted once rather than per insert. */
    private dirty = false;

    private static key(x: number, z: number): bigint {
        return ((BigInt(x) & 0xffffffffn) << 32n) | (BigInt(z) & 0xffffffffn);
    }

    public get size(): number {
        return this.queue.length;
    }

    public isEmpty(): boolean {
        return this.queue.length === 0;
    }

    public has(x: number, z: number): boolean {
        return this.queued.has(ChunkSender.key(x, z));
    }

    /**
     * Moves the player the queue is centred on.
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

        this.queued.add(key);
        this.queue.push({ x, z, priority: this.priorityOf(x, z) });
        this.dirty = true;
    }

    /** The next chunk to send, nearest to the player, or null when there is nothing left. */
    public next(): { x: number; z: number } | null {
        if (this.queue.length === 0) return null;

        if (this.dirty) {
            for (const entry of this.queue) entry.priority = this.priorityOf(entry.x, entry.z);
            // Descending, so the nearest chunk is at the end and pop() is O(1).
            this.queue.sort((a, b) => b.priority - a.priority);
            this.dirty = false;
        }

        const entry = this.queue.pop()!;
        this.queued.delete(ChunkSender.key(entry.x, entry.z));

        return { x: entry.x, z: entry.z };
    }

    /** Drops a chunk that no longer needs sending, because the player walked away from it. */
    public forget(x: number, z: number): void {
        const key = ChunkSender.key(x, z);
        if (!this.queued.delete(key)) return;

        this.queue = this.queue.filter((entry) => !(entry.x === x && entry.z === z));
    }

    public clear(): void {
        this.queue = [];
        this.queued.clear();
    }

    private priorityOf(x: number, z: number): number {
        const dx = x - this.centerX;
        const dz = z - this.centerZ;

        return dx * dx + dz * dz;
    }
}

export default ChunkSender;
