import * as Generators from './generators/Generators';
import type { Generator } from './';
import type Server from '../Server';
import type BlockManager from '../block/BlockManager';

export class GeneratorManager {
    private readonly generators: Map<string, Generator> = new Map();

    public constructor(server: Server) {
        const entries = Object.entries(Generators);
        for (const [key, GeneratorClass] of entries) {
            this.registerClassGenerator(key, GeneratorClass, server);
        }
        server.getLogger().verbose(`Registered §b${entries.length}§r generator(s)!`);

        // Here rather than in a world, because a generator is shared by every world that names
        // it, and because this runs before the shutdown awaits anything - which matters when
        // the thing being given up is the reason the event loop is busy. See
        // {@link Server.releaseOnShutdown} and {@link Generator.stopGenerating}.
        server.releaseOnShutdown(() => this.stopGenerating());
    }

    /**
     * Gives up the queued chunks of every registered generator.
     *
     * Called at the top of a shutdown. What is already being generated finishes; what is only
     * queued is dropped, since the save that follows writes the chunks a world has in memory
     * and a chunk the generator never started is not one of them.
     */
    public stopGenerating(): void {
        for (const generator of this.generators.values()) generator.stopGenerating?.();
    }

    public registerClassGenerator(
        id: string,
        generator: new (blockManager: BlockManager) => Generator,
        server: Server
    ): void {
        this.generators.set(id.toLowerCase(), new generator(server.getBlockManager()));
        server.getLogger().debug(`Generator with id §b${id}§r registered`);
    }

    public getGenerator(id: string): Generator {
        id = id.toLowerCase();

        if (!this.generators.has(id)) {
            throw new Error(`Invalid generator with id ${id}`);
        }
        return this.generators.get(id)!;
    }
}
