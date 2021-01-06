import Chunk from './chunk/Chunk';
import SharedSeedRandom from './util/SharedSeedRandom';

export default interface Generator {
    /**
     * This function should return the generated chunk by given parameters.
     */
    generateChunk(cx: number, cz: number, seed?: SharedSeedRandom): Promise<Chunk>;
}
