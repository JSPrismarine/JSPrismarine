const DataPacket = require('./packet')
const Identifiers = require('../identifiers')

'use strict'

class SetGamemodePacket extends DataPacket {
    static NetID = Identifiers.CreativeContentPacket

    /** @type {Array} */
    entries = []

    encodePayload() {
        this.writeUnsignedVarInt(this.entries.length)

        for (let i = 0; i < this.entries.length; i++) {
            // TODO write CreativeContentEntry
        }
    }

    decodePayload() {
        // TODO
    }
}
module.exports = SetGamemodePacket
