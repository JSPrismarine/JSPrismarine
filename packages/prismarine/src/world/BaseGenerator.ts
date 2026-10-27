import { blockFromContent } from '../block/Block';
import type { Block } from '../block/Block';
import type { BlockStateValue } from '@jsprismarine/blocks';
import type { ServerContent } from '../content/ServerContent';
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
    private readonly contentSource: () => ServerContent;
    private readonly logger: GeneratorLogger | undefined;

    /**
     * @param contentSource - The server's loaded content, read when a chunk is generated.
     * @param logger - Where to report a decision a person should see. Absent in a test, which
     *   is why every use of it is optional.
     */
    public constructor(contentSource: () => ServerContent, logger?: GeneratorLogger) {
        this.contentSource = contentSource;
        this.logger = logger;
    }

    /**
     * Generates a chunk by the given data.
     *
     * @param cx - chunk x
     * @param cz - chunk z
     * @param seed - random seed
     */
    public abstract generateChunk(cx: number, cz: number, seed?: bigint): Promise<Chunk>;

    protected getContent(): ServerContent {
        return this.contentSource();
    }

    protected getBlock(name: string, states: Readonly<Record<string, BlockStateValue>> = {}): Block {
        const block = blockFromContent(name, this.getContent(), states);
        if (block === null) throw new Error(`invalid block with id ${name}`);

        return block;
    }

    protected getLogger(): GeneratorLogger | undefined {
        return this.logger;
    }
}
