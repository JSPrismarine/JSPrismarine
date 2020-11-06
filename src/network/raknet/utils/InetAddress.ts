export default class InetAddress {
    #address: string;
    #port: number;
    #version: number;

    constructor(address: string, port: number, version = 4) {
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
