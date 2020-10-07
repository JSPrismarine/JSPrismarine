const DataPacket = require('./packet')
const Identifiers = require('../identifiers')
const CreativeContentEntry = require('../type/creative-content-entry')

'use strict'

class CreativeContentPacket extends DataPacket {
    static NetID = Identifiers.CreativeContentPacket

    /** @type {CreativeContentEntry[]} */
    entries = []

    encodePayload() {
        this.writeUnsignedVarInt(this.entries.length)

        for (let i = 0; i < this.entries.length; i++) {
            this.writeCreativeContentEntry(this.entries[i])
        }
    }

    decodePayload() {
        // TODO
    }
}
module.exports = CreativeContentPacket
