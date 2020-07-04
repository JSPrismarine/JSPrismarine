const DataPacket = require("./data_packet")
const Identifiers = require("../identifiers")

'use strict'

const ViolationType = {
    SeverityWarning: 0,
    SeverityFinalWarning: 1,
    SeverityTerminatingConnection: 2
}
class PacketViolationWarningPacket extends DataPacket {
    static NetID = Identifiers.PacketViolationWarningPacket

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
module.exports = { PacketViolationWarningPacket, ViolationType }