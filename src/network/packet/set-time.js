const DataPacket = require('./packet')
const Identifiers = require('../identifiers')

'use strict'

class SetTimePacket extends DataPacket {
    static NetID = Identifiers.SetTimePacket

    /** @type {number} */
    time

    decodePayload() {
        this.type = this.readVarInt()
    }

    encodePayload() {
        this.writeVarInt(this.time)
    }
}
module.exports = SetTimePacket