import Chunk from './chunk/Chunk.js';

export default interface Generator {
    /**
     * This function should return the generated chunk by given parameters.
     */
    generateChunk(cx: number, cz: number, seed?: number, config?: any): Promise<Chunk>;
}
