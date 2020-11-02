import type Prismarine from "../Prismarine";

export default class ConsoleSender {

    /** @type {Prismarine} */
    #server: Prismarine

    name = "CONSOLE"

    constructor(server: Prismarine) {
        this.#server = server;
    }

    sendMessage(text: string) {
        this.#server.getLogger().info(text);
    }

    getServer() {
        return this.#server;
    }
}
