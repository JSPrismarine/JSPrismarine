const DataPacket = require("./data_packet")

'use strict'

class RequestChunkRadiusPacket extends DataPacket {
    static NetID = 0x45  // TODO

    radius

    decodePayload() {
        this.radius = this.readVarInt()
    }
}
module.exports = RequestChunkRadiusPacket