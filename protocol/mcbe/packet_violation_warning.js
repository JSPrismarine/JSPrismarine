const DataPacket = require("./data_packet")

'use strict'

const ViolationType = {
    SeverityWarning: 0,
    SeverityFinalWarning: 1,
    SeverityTerminatingConnection: 2
}
class PacketViolationWarning extends DataPacket {
    static NetID = 0x9c  // TODO

    type
    severity
    packetId
    violationContext

    decodePayload() {
        this.type = this.readVarInt()
        this.severity = this.readVarInt()
        this.packetId = this.readVarInt()
        this.violationContext = this.readRemaining()
    }
}
module.exports = { PacketViolationWarning, ViolationType }