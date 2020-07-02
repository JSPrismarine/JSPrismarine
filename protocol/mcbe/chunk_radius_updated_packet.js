const DataPacket = require("./data_packet")

'use strict'

class ChunkRadiusUpdatedPacket extends DataPacket {
    static NetID = 0x46  // TODO

    radius

    encodePayload() {
        this.writeVarInt(this.radius)
    }
}
module.exports = ChunkRadiusUpdatedPacket