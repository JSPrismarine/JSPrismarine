import fs from 'fs';
import path from 'path';
import type Prismarine from '../Prismarine';

export default class GeneratorManager {
    private generators: Map<string, any> = new Map();

    constructor(server: Prismarine) {
        const generators = fs.readdirSync(__dirname + '/generators');
        generators.forEach((generator) => {
            if (generator.includes('.test.') || generator.includes('.d.ts'))
                return;
            this.registerClassGenerator(generator.split('.')[0], server);
        });
        server
            .getLogger()
            .debug(`Registered §b${generators.length}§r generator(s)!`);
    }

    registerClassGenerator(id: string, server: Prismarine) {
        const generator = require(path.resolve(__dirname + '/generators', id));
        this.generators.set(
            id.toLowerCase(),
            new (generator.default || generator)()
        );
        server.getLogger().silly(`Generator with id §b${id}§r registered`);
    }

    getGenerator(id: string) {
        return this.generators.get(id);
    }
}
