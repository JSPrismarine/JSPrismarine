const DataPacket = require('./packet')
const Identifiers = require('../identifiers')

'use strict'

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
module.exports = PacketViolationWarningPacket