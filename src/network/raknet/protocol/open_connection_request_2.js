const OfflinePacket = require('./offline_packet');
const Identifiers = require('./identifiers');
const InetAddress = require('../utils/inet_address');

'use strict';

class OpenConnectionRequest2 extends OfflinePacket {

    constructor() {
        super(Identifiers.OpenConnectionRequest2);
    }

    /** @type {InetAddress} */
    #serverAddress
    /** @type {number} */
    #mtuSize
    /** @type {number} */
    #clientGUID

    read() {
        super.read();
        this.readMagic();
        this.#serverAddress = this.readAddress();
        this.#mtuSize = this.readShort();
        this.#clientGUID = this.readLong();
    }

    write() {
        super.write();
        this.writeMagic();
        this.writeAddress(this.#serverAddress);
        this.writeShort(this.#mtuSize);
        this.writeLong(this.#clientGUID);
    }

    get serverAddress() {
        return this.#serverAddress;
    }

    set serverAddress(serverAddress) {
        this.#serverAddress = serverAddress;
    }

    get mtuSize() {
        return this.#mtuSize;
    }

    set mtuSize(mtuSize) {
        this.#mtuSize = mtuSize;
    }

    get clientGUID() {
        return this.#clientGUID;
    }

    set clientGUID(clientGUID) {
        this.#clientGUID = clientGUID;
    }

}
module.exports = OpenConnectionRequest2;