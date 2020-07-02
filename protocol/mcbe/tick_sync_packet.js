const DataPacket = require("./data_packet")

'use strict'

class TickSyncPacket extends DataPacket {
    static NetID = 0x17  // TODO

    clientRequestTimestamp
    serverReceptionTimestamp

    decodePayload() {
        this.clientRequestTimestamp = this.readLLong()
        this.serverReceptionTimestamp = this.readLLong()
    }
}
module.exports = TickSyncPacket