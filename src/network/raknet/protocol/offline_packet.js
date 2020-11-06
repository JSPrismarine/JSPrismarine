const Packet = require('./packet');

('use strict');

const MAGIC =
    '\x00\xff\xff\x00\xfe\xfe\xfe\xfe\xfd\xfd\xfd\xfd\x12\x34\x56\x78';
class OfflinePacket extends Packet {
    /** @type {Buffer} */
    #magic;

    // Used to read offline packets magic (needed to validate the packet)
    readMagic() {
        this.#magic = this.buffer.slice(this.offset, this.addOffset(16, true));
    }

    writeMagic() {
        this.append(Buffer.from(MAGIC, 'binary'));
    }

    get valid() {
        return Buffer.compare(this.buffer, this.#magic);
    }
}
module.exports = OfflinePacket;
