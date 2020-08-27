const DataPacket = require('./packet')
const Identifiers = require('../identifiers')

'use strict'

class LevelEventPacket extends DataPacket {
    static NetID = Identifiers.LevelEventPacket

    eventId
    x = 0.0
    y = 0.0
    z = 0.0
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