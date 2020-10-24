const OfflinePacket = require('./offline_packet');
const Identifiers = require('./identifiers');

'use strict';

class OpenConnectionRequest1 extends OfflinePacket {

    constructor() {
        super(Identifiers.OpenConnectionRequest1);
    }

    /** @type {number} */
    #mtuSize
    /** @type {number} */
    #protocol 

    read() {
        super.read();
        this.#mtuSize = (Buffer.byteLength(this.buffer) + 1) + 28;
        this.readMagic();
        this.#protocol = this.readByte();
    }

    write() {
        super.write();
        this.writeMagic();
        this.writeByte(this.#protocol);
        let length = (this.#mtuSize - this.buffer.length);
        let buf = Buffer.alloc(length).fill(0x00);
        this.append(buf);
    }

    get mtuSize() {
        return this.#mtuSize;
    }

    set mtuSize(mtuSize) {
        this.#mtuSize = mtuSize;
    }

    get protocol() {
        return this.#protocol;
    }

    set protocol(protocol) {
        this.#protocol = protocol;
    }

}
module.exports = OpenConnectionRequest1;
