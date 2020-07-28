const DataPacket = require('./packet')
const Identifiers = require('../identifiers')

'use strict'

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
module.exports = LevelEventPacket