import Chunk from './chunk/Chunk';

export default interface Generator {
    /**
     * This function should return the generated chunk by given parameters.
     */
    generateChunk(cx: number, cz: number, seed?: number): Promise<Chunk>;
}
