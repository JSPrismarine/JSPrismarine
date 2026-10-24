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
