const DataPacket = require('./packet')
const Identifiers = require('../identifiers')

'use strict'

class PlayStatusPacket extends DataPacket {
    static NetID = Identifiers.PlayStatusPacket

    status

    encodePayload() {
        this.writeInt(this.status)
    }
}
module.exports = PlayStatusPacket