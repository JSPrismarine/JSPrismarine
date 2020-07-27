const DataPacket = require("./data_packet")
const Identifiers = require("../identifiers")

'use strict'

const LevelEventIds = {
    BlockStartBreak: 3600,
    BlockStopBreak: 3601,
    ParticlePunchBlock: 2014
}
class LevelEventPacket extends DataPacket {
    static NetID = Identifiers.LevelEventPacket

    eventId
    x
    y
    z
    data

    encodePayload() {
        this.writeVarInt(this.eventId)

        this.writeLFloat(this.x)
        this.writeLFloat(this.y)
        this.writeLFloat(this.z)

        this.writeVarInt(this.data)
    } 
}
module.exports = { LevelEventIds, LevelEventPacket }