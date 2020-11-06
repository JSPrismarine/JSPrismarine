const Packet = require('./packet');
const Identifiers = require('./Identifiers').default;

('use strict');

class ConnectedPing extends Packet {
    constructor() {
        super(Identifiers.ConnectedPing);
    }

    #clientTimestamp;

    read() {
        super.read();
        this.clientTimestamp = this.readLong();
    }

    write() {
        super.write();
        this.writeLong(this.clientTimestamp);
    }

    get clientTimestamp() {
        return this.#clientTimestamp;
    }

    set clientTimestamp(clientTimestamp) {
        this.#clientTimestamp = clientTimestamp;
    }
}
module.exports = ConnectedPing;
