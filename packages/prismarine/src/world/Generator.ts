import type { WorldConfig } from './World';
import type Chunk from './chunk/Chunk';

/**
 * How a generator refuses a chunk once {@link Generator.stopGenerating} has been called.
 *
 * Its own class so a caller can tell a shutdown apart from a chunk that genuinely could not be
 * generated. Those are the same `Error` otherwise, and the start region has to report one and
 * re-throw the other.
 */
export class GenerationStopped extends Error {
    /**
     * @param cx - Chunk x of the request that was refused.
     * @param cz - Chunk z of the request that was refused.
     */
    public constructor(cx: number, cz: number) {
        super(`Chunk ${cx},${cz} was not generated: the generator has stopped`);
        this.name = 'GenerationStopped';
    }
}

export interface Generator {
    /**
     * This function should return the generated chunk by given parameters.
     */
    generateChunk(cx: number, cz: number, seed?: number, config?: WorldConfig): Promise<Chunk>;

    /**
     * Gives up every chunk request that has not started yet, for a server that is shutting down.
     *
     * A generator that answers one request at a time holds a queue, and a start region fills
     * that queue thirty-two chunks at a time. Waiting for it to drain means a shutdown spends
     * seconds generating terrain that the save it is about to run will not even look at. The
     * request that is already running finishes, so no half-generated chunk is handed back;
     * everything behind it rejects with {@link GenerationStopped}.
     *
     * Optional, because a generator that answers immediately has no queue to give up.
     */
    stopGenerating?(): void;
}
