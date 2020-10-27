<<<<<<< HEAD
const DataPacket = require('./packet').default;
const Identifiers = require('../Identifiers').default;
const CreativeContentEntry = require('../type/CreativeContentEntry').default;
=======
const DataPacket = require('./Packet').default;
const Identifiers = require('../Identifiers').default;
const CreativeContentEntry = require('../type/creative-content-entry');
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e


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
