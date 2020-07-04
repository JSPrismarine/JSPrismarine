const DataPacket = require("./data_packet")
const Identifiers = require("../identifiers")

'use strict'

class ClientCacheStatusPacket extends DataPacket {
    static NetID = Identifiers.ClientCacheStatusPacket

    enabled

    decodePayload() {
        this.enabled = this.readBool()
    }
}
module.exports = ClientCacheStatusPacket