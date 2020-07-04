const DataPacket = require("./data_packet")
const Identifiers = require("../identifiers")

'use strict'

class TickSyncPacket extends DataPacket {
    static NetID = Identifiers.TickSyncPacket

    clientRequestTimestamp
    serverReceptionTimestamp

    decodePayload() {
        this.clientRequestTimestamp = this.readLLong()
        this.serverReceptionTimestamp = this.readLLong()
    }
}
module.exports = TickSyncPacket