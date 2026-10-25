import type BlockManager from '../block/BlockManager';
import type Chunk from './chunk/Chunk';
import type { Generator } from './Generator';

/**
 * What a generator needs from the server's logger.
 *
 * Structural rather than the `Logger` class, so a generator can be built in a test without a
 * server behind it. A generator has one thing worth saying: where it decided to run its terrain,
 * and why, which a person reading the console has no other way to find out.
 */
export interface GeneratorLogger {
    info(...message: string[]): void;
    warn(...message: string[]): void;
}

export default abstract class BaseGenerator implements Generator {
    private readonly blockManager: BlockManager;
    private readonly logger: GeneratorLogger | undefined;

    /**
     * @param blockManager - The server's blocks.
     * @param logger - Where to report a decision a person should see. Absent in a test, which
     *   is why every use of it is optional.
     */
    public constructor(blockManager: BlockManager, logger?: GeneratorLogger) {
        this.blockManager = blockManager;
        this.logger = logger;
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

    protected getLogger(): GeneratorLogger | undefined {
        return this.logger;
    }
}
