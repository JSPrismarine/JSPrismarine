const DataPacket = require("./data_packet")

'use strict'

class ClientCacheStatusPacket extends DataPacket {
    static NetID = 0x81  // TODO

    enabled

    decodePayload() {
        this.enabled = this.readBool()
    }
}
module.exports = ClientCacheStatusPacket