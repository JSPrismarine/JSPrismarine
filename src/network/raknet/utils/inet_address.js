'use strict';

class InetAddress {

    /** @type {string} */
    #address
    /** @type {number} */
    #port
    /** @type {number} */
    #version

    constructor(address, port, version = 4) {
        this.#address = address;
        this.#port = port;
        this.#version = version;
    }

    get address() {
        return this.#address;
    }

    get port() {
        return this.#port;
    }

    get version() {
        return this.#version;
    }

}
module.exports = InetAddress;