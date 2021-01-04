import BlockManager from '../block/BlockManager';
import Chunk from './chunk/Chunk';
import Generator from './Generator';
import SharedSeedRandom from './util/SharedSeedRandom';

export default abstract class BaseGenerator implements Generator {
    private readonly blockManager: BlockManager;

    public constructor(blockManager: BlockManager) {
        this.blockManager = blockManager;
    }

    /**
     * Generates a chunk by the given data.
     *
     * @param cx - chunk x
     * @param cz - chunk z
     * @param seed - random seed
     */
    public abstract generateChunk(
        cx: number,
        cz: number,
        seed?: SharedSeedRandom
    ): Chunk;

    protected getBlockManager(): BlockManager {
        return this.blockManager;
    }
}
