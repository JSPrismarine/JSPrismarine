const DataPacket = require('./packet')
const Identifiers = require('../identifiers')

'use strict'

class ChunkRadiusUpdatedPacket extends DataPacket {
    static NetID = Identifiers.ChunkRadiusUpdatedPacket

    radius

    encodePayload() {
        this.writeVarInt(this.radius)
    }
}
module.exports = ChunkRadiusUpdatedPacket