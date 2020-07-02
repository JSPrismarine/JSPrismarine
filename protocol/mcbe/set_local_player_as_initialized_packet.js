const DataPacket = require("./data_packet")

'use strict'

class SetLocalPlayerAsInitializedPacket extends DataPacket {
    static NetID = 0x71

    runtimeEntityId

    decodePayload() {
        this.runtimeEntityId = this.readUnsignedVarLong()
    }
}
module.exports = SetLocalPlayerAsInitializedPacket