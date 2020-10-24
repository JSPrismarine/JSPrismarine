const OfflinePacket = require("./offline_packet");
const Identifiers = require('./Identifiers').default;

'use strict'; 

class IncompatibleProtocolVersion extends OfflinePacket {

    constructor() {
        super(Identifiers.IncompatibleProtocolVersion);
    }

    /** @type {number} */
    #protocol
    /** @type {number} */
    #serverGUID

    write() {
        super.write();
        this.writeByte(this.#protocol);
        this.writeMagic();
        this.writeLong(this.#serverGUID);
    }

    set protocol(protocol) {
        this.#protocol = protocol;
    }

    set serverGUID(serverGUID) {
        this.#serverGUID = serverGUID;
    }
    
}
module.exports = IncompatibleProtocolVersion;
