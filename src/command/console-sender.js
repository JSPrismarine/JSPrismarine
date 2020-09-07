const Prismarine = require('../prismarine')
const logger = require('../utils/logger')
const mcColors = require("mccolorstoconsole")

'use strict'

class ConsoleSender {

    /** @type {Prismarine} */
    #server

    name = "CONSOLE"

    constructor(server) {
        this.#server = server
    }

    sendMessage(text) {
        logger.info(text)
    }

    getServer() {
        return this.#server
    }
}
module.exports = ConsoleSender