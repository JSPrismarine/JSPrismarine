const fs = require('fs')
const path = require('path')
const logger = require('../utils/logger')

class GeneratorManager {
    #generators = new Map()

    constructor() {
        const generators = fs.readdirSync(__dirname + '/generators')
        generators.forEach((generator) => this.registerClassGenerator(generator?.replace('.js', '')))
        logger.debug(`Registered §b${generators.length}§r generator(s)!`)
    }

    registerClassGenerator(id) {
        const generator = require(path.resolve(__dirname + '/generators', id))
        this.#generators.set(id, new generator())
        logger.silly(`Generator with id §b${id}§r registered`)
    }

    getGenerator(id) {
        return this.#generators.get(id)
    }
}
module.exports = GeneratorManager
