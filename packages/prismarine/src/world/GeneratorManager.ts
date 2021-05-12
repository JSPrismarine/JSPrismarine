import * as Generators from './generators/Generators';

import type Generator from './Generator';
import type Server from '../Server';

export default class GeneratorManager {
    private readonly generators: Map<string, Generator> = new Map() as Map<string, Generator>;

    public constructor(server: Server) {
        this.registerClassGenerator('flat', Generators.Flat, server);
        this.registerClassGenerator('overworld', Generators.Overworld, server);
        server.getLogger()?.verbose(`Registered §b${2}§r generator(s)!`, 'GeneratorManager');
    }

    public registerClassGenerator(id: string, generator: any, server: Server): void {
        this.generators.set(id.toLowerCase(), new generator(server.getBlockManager()));
        server.getLogger()?.debug(`Generator with id §b${id}§r registered`, 'registerClassGenerator');
    }

    public getGenerator(id: string): Generator {
        if (!this.generators.has(id)) {
            throw new Error(`Invalid generator with id ${id}`);
        }
        return this.generators.get(id)!;
    }
}
