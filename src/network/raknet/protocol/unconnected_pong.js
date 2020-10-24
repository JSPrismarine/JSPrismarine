const OfflinePacket = require('./offline_packet');
const Identifiers = require('./identifiers');

'use strict';

class UnconnectedPong extends OfflinePacket {
    
    constructor() {
        super(Identifiers.UnconnectedPong);
    }

    /** @type {number} */
    #sendTimestamp
    /** @type {number} */
    #serverGUID
    /** @type {string} */
    #serverName

    read() {
        super.read();
        this.#sendTimestamp = this.readLong();
        this.#serverGUID = this.readLong();
        this.readMagic();
        this.#serverName = this.readRemaining().toString();  // readString
    }

    write() {
        super.write();
        this.writeLong(this.#sendTimestamp);
        this.writeLong(this.#serverGUID);
        this.writeMagic();
        this.writeString(this.#serverName);
    }

    get sendTimestamp() {
        return this.#sendTimestamp;
    }

    set sendTimestamp(sendTimestamp) {
        this.#sendTimestamp = sendTimestamp;
    }

    get serverGUID() {
        return this.#serverGUID;
    }

    set serverGUID(serverGUID) {
        this.#serverGUID = serverGUID;
    }

    get serverName() {
        return this.#serverName;
    }

    set serverName(serverName) {
        this.#serverName = serverName;
    }
    
}
module.exports = UnconnectedPong;