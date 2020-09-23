const DataPacket = require('./packet')
const Identifiers = require('../identifiers')

'use strict'

class WorldEventPacket extends DataPacket {
    static NetID = Identifiers.WorldEventPacket

    /** @type {number} */
    eventId
    /** @type {number} */
    x = 0.0
    /** @type {number} */
    y = 0.0
    /** @type {number} */
    z = 0.0
    /** @type {number} */
    data

    encodePayload() {
        this.writeVarInt(this.eventId)

        this.writeLFloat(this.x)
        this.writeLFloat(this.y)
        this.writeLFloat(this.z)

        this.writeVarInt(this.data)
    } 
}
module.exports = WorldEventPacket