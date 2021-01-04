import Generator from './Generator';
import type Server from '../Server';
import fs from 'fs';
import path from 'path';

export default class GeneratorManager {
    private readonly generators: Map<string, Generator> = new Map();

    public constructor(server: Server) {
        const generators = fs.readdirSync(path.join(__dirname, '/generators'));
        generators.forEach((generator) => {
            if (
                generator.includes('.test.') ||
                generator.includes('.d.ts') ||
                generator.includes('.map')
            ) {
                return;
            }
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
            new (generator.default ?? generator)(server.getBlockManager())
        );
        server
            .getLogger()
            .silly(
                `Generator with id §b${id}§r registered`,
                'registerClassGenerator'
            );
    }

    public getGenerator(id: string): Generator {
        if (!this.generators.has(id)) {
            throw new Error(`Invalid generator with id ${id}`);
        }
        return this.generators.get(id)!;
    }
}
