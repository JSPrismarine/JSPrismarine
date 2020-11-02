const Packet = require('./packet');
const Identifiers = require('./Identifiers').default;

'use strict';

class ConnectionRequest extends Packet {

    constructor() {
        super(Identifiers.ConnectionRequest);
    }

    #clientGUID
    #requestTimestamp

    read() {
        super.read();
        this.#clientGUID = this.readLong();
        this.#requestTimestamp = this.readLong();
        this.readByte();  // secure
    }

    write() {
        super.write();
        this.writeLong(this.#clientGUID);
        this.writeLong(this.requestTimestamp);
        this.writeByte(0);  // secure
    }

    get clientGUID() {
        return this.#clientGUID;
    }

    set clientGUID(clientGUID) {
        this.#clientGUID = clientGUID;
    }

    get requestTimestamp() {
        return this.#requestTimestamp;
    }

    set requestTimestamp(requestTimestamp) {
        this.#requestTimestamp = requestTimestamp;
    }

}
module.exports = ConnectionRequest;
