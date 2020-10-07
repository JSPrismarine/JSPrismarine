const fs = require('fs')
const path = require('path')

class GeneratorManager {
    #generators = new Map()

    constructor() {
        const generators = fs.readdirSync(__dirname + '/generators')
        generators.forEach((generator) => this.registerClassGenerator(generator))
    }

    registerClassGenerator(id) {
        const generator = null
        this.#generators.set(id, generator)
    }
}
module.exports = GeneratorManager
