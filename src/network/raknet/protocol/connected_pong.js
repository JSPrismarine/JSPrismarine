const Packet = require("./packet");
const Identifiers = require("./identifiers");

'use strict';

class ConnectedPong extends Packet {

    constructor() {
        super(Identifiers.ConnectedPong);
    }

    #clientTimestamp
    #serverTimestamp

    write() {
        super.write();
        this.writeLong(this.clientTimestamp);
        this.writeLong(this.serverTimestamp);
    }

    get clientTimestamp() {
        return this.#clientTimestamp;
    }

    set clientTimestamp(clientTimestamp) {
        this.#clientTimestamp = clientTimestamp;
    }

    get serverTimestamp() {
        return this.#serverTimestamp;
    }

    set serverTimestamp(serverTimestamp) {
        this.#serverTimestamp = serverTimestamp;
    }
        
}
module.exports = ConnectedPong;