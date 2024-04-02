import type BlockManager from '../block/BlockManager';
import type Chunk from './chunk/Chunk';
import type Generator from './Generator';

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
    public abstract generateChunk(cx: number, cz: number, seed?: number): Promise<Chunk>;

    protected getBlockManager(): BlockManager {
        return this.blockManager;
    }
}
