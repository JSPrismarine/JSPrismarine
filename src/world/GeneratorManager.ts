import fs from 'fs';
import path from 'path';
import type Server from '../Server';

export default class GeneratorManager {
    private readonly generators: Map<string, any> = new Map();

    public constructor(server: Server) {
        const generators = fs.readdirSync(path.join(__dirname, '/generators'));
        generators.forEach((generator) => {
            if (generator.includes('.test.') || generator.includes('.d.ts'))
                return;
            this.registerClassGenerator(generator.split('.')[0], server);
        });
        server
            .getLogger()
            .debug(
                `Registered §b${generators.length}§r generator(s)!`,
                'GeneratorManager'
            );
    }

    public registerClassGenerator(id: string, server: Server): void {
        const generator = require(path.resolve(
            path.join(__dirname, '/generators', id)
        ));
        this.generators.set(
            id.toLowerCase(),
            new (generator.default || generator)()
        );
        server
            .getLogger()
            .silly(
                `Generator with id §b${id}§r registered`,
                'registerClassGenerator'
            );
    }

    public getGenerator(id: string): any {
        return this.generators.get(id);
    }
}
