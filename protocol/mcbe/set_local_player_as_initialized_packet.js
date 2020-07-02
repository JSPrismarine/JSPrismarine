const DataPacket = require("./data_packet")

'use strict'

class SetLocalPlayerAsInitializedPacket extends DataPacket {
    static NetID = 0x71

    entityRuntimeId

    decodePayload() {
        this.entityRuntimeId = this.readUnsignedVarLong()
    }
}
module.exports = SetLocalPlayerAsInitializedPacket