const OfflinePacket = require('./offline_packet');
const Identifiers = require('./Identifiers').default;

('use strict');

class UnconnectedPing extends OfflinePacket {
    constructor() {
        super(Identifiers.UnconnectedPing);
    }

    /** @type {number} */
    #sendTimestamp;
    /** @type {number} */
    #clientGUID;

    read() {
        super.read();
        this.#sendTimestamp = this.readLong();
        this.readMagic();
        this.#clientGUID = this.readLong();
    }

    write() {
        super.write();
        this.writeLong(this.#sendTimestamp);
        this.writeMagic();
        this.writeLong(this.#clientGUID);
    }

    get sendTimeStamp() {
        return this.#sendTimestamp;
    }

    set sendTimeStamp(sendTimeStamp) {
        this.#sendTimestamp = sendTimeStamp;
    }

    get clientGUID() {
        return this.#clientGUID;
    }

    set clientGUID(clientGUID) {
        this.#clientGUID = clientGUID;
    }
}
module.exports = UnconnectedPing;
