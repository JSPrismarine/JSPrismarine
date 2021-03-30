import type Chunk from '../chunk/Chunk';
import type Generator from '../Generator';

export default interface Provider {
    /**
     * Returns the path to the world folder.
     */
    getPath(): string;

    /**
     * Returns the chunk decoded from the provider.
     * @param cx - chunk x.
     * @param cz - chunk z.
     * @param seed - world seed.
     * @param generator - chunk generator.
     * @param config - config object.
     */
    readChunk(cx: number, cz: number, seed: number, generator: Generator, config?: any): Promise<Chunk>;

    /**
     * Writes a chunk
     * @param chunk - chunk x
     */
    writeChunk(chunk: Chunk): Promise<void>;
}
