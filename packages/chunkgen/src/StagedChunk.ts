import type { ChunkStatus } from './ChunkStatus';

/**
 * All a holder needs of the thing it drives up the ladder.
 *
 * The package ships no chunk of its own: the holder, the map and the scheduler take the chunk type
 * as a parameter, so a server climbs the ladder with the chunk buffer it already has rather than
 * copying every block into a second representation twice per status. `@jsprismarine/prismarine`
 * does exactly that: its generation stages speak Java block states with properties.
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
     * @throws ChunkStatusRegressionError when the target is not above the current status.
     */
    advanceTo(status: ChunkStatus): void;
}

/** Raised when a chunk is asked to move to a status at or below the one it already holds. */
export class ChunkStatusRegressionError extends Error {
    public override name = 'ChunkStatusRegressionError';

    public constructor(
        public readonly from: ChunkStatus,
        public readonly to: ChunkStatus
    ) {
        super(`A chunk at ${from} cannot advance to ${to}: a status body runs once and never runs backward.`);
    }
}
