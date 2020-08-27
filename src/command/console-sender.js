'use strict'

const Prismarine = require("../prismarine")

class ConsoleSender {

    /** @type {Prismarine} */
    #server

    constructor(server) {
        this.#server = server
    }

    getServer() {
        return this.#server
    }
}
module.exports = ConsoleSender