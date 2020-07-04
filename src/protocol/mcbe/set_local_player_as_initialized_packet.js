const DataPacket = require("./data_packet")
const Identifiers = require("../identifiers")

'use strict'

class SetLocalPlayerAsInitializedPacket extends DataPacket {
    static NetID = Identifiers.SetLocalPlayerAsInitializedPacket

    runtimeEntityId

    decodePayload() {
        this.runtimeEntityId = this.readUnsignedVarLong()
    }
}
module.exports = SetLocalPlayerAsInitializedPacket