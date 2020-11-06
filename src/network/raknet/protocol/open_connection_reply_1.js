const OfflinePacket = require('./offline_packet');
const Identifiers = require('./Identifiers').default;

('use strict');

class OpenConnectionReply1 extends OfflinePacket {
    constructor() {
        super(Identifiers.OpenConnectionReply1);
    }

    /** @type {number} */
    #serverGUID;
    /** @type {number} */
    #mtuSize;

    read() {
        super.read();
        this.readMagic();
        this.#serverGUID = this.readLong();
        this.readByte(); // secure
        this.#mtuSize = this.readShort();
    }

    write() {
        super.write();
        this.writeMagic();
        this.writeLong(this.#serverGUID);
        this.writeByte(0); // secure
        this.writeShort(this.#mtuSize);
    }

    get serverGUID() {
        return this.#serverGUID;
    }

    set serverGUID(serverGUID) {
        this.#serverGUID = serverGUID;
    }

    get mtuSize() {
        return this.#mtuSize;
    }

    set mtuSize(mtuSize) {
        this.#mtuSize = mtuSize;
    }
}
module.exports = OpenConnectionReply1;
