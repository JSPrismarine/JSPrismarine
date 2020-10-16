const fs = require('fs');
const path = require('path');

class GeneratorManager {
    #generators = new Map()

    constructor(server) {
        const generators = fs.readdirSync(__dirname + '/generators');
        generators.forEach((generator) => {
            if (generator.includes('.test.') || generator.includes('.d.ts'))
                return;
            this.registerClassGenerator(generator.split('.')[0], server);
        });
        server.getLogger().debug(`Registered §b${generators.length}§r generator(s)!`);
    }

    registerClassGenerator(id, server) {
        const generator = require(path.resolve(__dirname + '/generators', id));
        this.#generators.set(id, new generator());
        server.getLogger().silly(`Generator with id §b${id}§r registered`);
    }

    getGenerator(id) {
        return this.#generators.get(id);
    }
}
module.exports = GeneratorManager;
