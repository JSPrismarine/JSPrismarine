const DataPacket = require('./packet')
const Identifiers = require('../identifiers')

'use strict'

class SetTitlePacket extends DataPacket {
    static NetID = Identifiers.SetTitlePacket

    /** @type {number} */
    type
    /** @type {string} */
    text = ''
    /** @type {number} */
    fadeInTime = 500
    /** @type {number} */
    stayTime = 3000
    /** @type {number} */
    fadeOutTime = 1000

    decodePayload() {
        this.type = this.readVarInt()
        this.text = this.readString()
        this.fadeInTime = this.readVarInt()
        this.stayTime = this.readVarInt()
        this.fadeOutTime = this.readVarInt()
    }

    encodePayload() {
        this.writeVarInt(this.type)
        this.writeString(this.text)
        this.writeVarInt(this.fadeInTime)
        this.writeVarInt(this.stayTime)
        this.writeVarInt(this.fadeOutTime)
    }
}
module.exports = SetTitlePacket
