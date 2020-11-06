const OfflinePacket = require('./offline_packet');
const Identifiers = require('./Identifiers').default;
const InetAddress = require('../utils/InetAddress').default;

('use strict');

class OpenConnectionReply2 extends OfflinePacket {
    constructor() {
        super(Identifiers.OpenConnectionReply2);
    }

    /** @type {number} */
    #serverGUID;
    /** @type {InetAddress} */
    #clientAddress;
    /** @type {number} */
    #mtuSize;

    read() {
        super.read();
        this.readMagic();
        this.#serverGUID = this.readLong();
        this.#clientAddress = this.readAddress();
        this.#mtuSize = this.readShort();
        this.readByte(); // secure
    }

    write() {
        super.write();
        this.writeMagic();
        this.writeLong(this.#serverGUID);
        this.writeAddress(this.#clientAddress);
        this.writeShort(this.#mtuSize);
        this.writeByte(0); // secure
    }

    get serverGUID() {
        return this.#serverGUID;
    }

    set serverGUID(serverGUID) {
        this.#serverGUID = serverGUID;
    }

    get clientAddress() {
        return this.#clientAddress;
    }

    set clientAddress(clientAddress) {
        this.#clientAddress = clientAddress;
    }

    get mtuSize() {
        return this.#mtuSize;
    }

    set mtuSize(mtuSize) {
        this.#mtuSize = mtuSize;
    }
}
module.exports = OpenConnectionReply2;
