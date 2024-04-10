import type Chunk from './chunk/Chunk';

export interface Generator {
    /**
     * This function should return the generated chunk by given parameters.
     */
    generateChunk(cx: number, cz: number, seed?: number, config?: any): Promise<Chunk>;
}
