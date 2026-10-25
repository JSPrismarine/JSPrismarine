import type { ChunkStatus } from './ChunkStatus';

/**
 * All a holder needs of the thing it drives up the ladder.
 *
 * {@link ProtoChunk} is the implementation this package ships and the one a worker transfers, and
 * it is the default everywhere a chunk type is a parameter. The seam exists because a server that
 * already has a chunk buffer of its own should climb the ladder with that buffer rather than
 * copying every block into a second representation twice per status. `@jsprismarine/prismarine`
 * does exactly that: its generation stages speak Java block states with properties, which a flat
 * string palette would have to encode and decode on the way in and out.
 *
 * The contract is the whole of what the ladder relies on. A chunk knows which rung it is on, and it
 * refuses to move to a rung at or below that one, because each (chunk, status) body runs once.
 */
export interface StagedChunk {
    readonly chunkX: number;
    readonly chunkZ: number;

    /** The status this chunk has reached. */
    readonly status: ChunkStatus;

    /**
     * Records that the chunk has reached a higher status.
     *
     * @throws Error when the target is not above the current status.
     */
    advanceTo(status: ChunkStatus): void;
}
