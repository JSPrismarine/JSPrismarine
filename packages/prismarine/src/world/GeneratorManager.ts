import * as Generators from './generators/Generators';
import type { Generator } from './';
import type Server from '../Server';
import type BaseGenerator from './BaseGenerator';

export class GeneratorManager {
    private readonly generators: Map<string, Generator> = new Map() as Map<string, Generator>;

    public constructor(server: Server) {
        const keys = Object.keys(Generators);
        for (const key of keys) {
            this.registerClassGenerator(key, (Generators as any)[key] as typeof BaseGenerator, server);
        }
        server.getLogger().verbose(`Registered §b${keys.length}§r generator(s)!`);
    }

    public registerClassGenerator(id: string, generator: any, server: Server): void {
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
