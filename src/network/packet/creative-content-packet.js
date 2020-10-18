const DataPacket = require('./packet');
const Identifiers = require('../Identifiers').default;
const CreativeContentEntry = require('../type/CreativeContentEntry').default;


class CreativeContentPacket extends DataPacket {
    static NetID = Identifiers.CreativeContentPacket

    /** @type {CreativeContentEntry[]} */
    entries = []

    encodePayload() {
        this.writeUnsignedVarInt(this.entries.length);

        for (let i = 0; i < this.entries.length; i++) {
            this.writeCreativeContentEntry(this.entries[i]);
        }
    }

    decodePayload() {
        // TODO
    }
}
module.exports = CreativeContentPacket;
