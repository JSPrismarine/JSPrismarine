const DataPacket = require('./data_packet')
const Identifiers = require('../identifiers')

'use strict'

class RemoveActorPacket extends DataPacket {
    static NetID = Identifiers.RemoveActorPacket

    uniqueEntityId

    encodePayload() {
        this.writeVarLong(this.uniqueEntityId)
    }
}
module.exports = RemoveActorPacket