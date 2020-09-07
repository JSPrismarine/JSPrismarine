const Prismarine = require('../prismarine')
const logger = require('../utils/logger')

'use strict'

class ConsoleSender {

    /** @type {Prismarine} */
    #server

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