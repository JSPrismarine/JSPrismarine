const DataPacket = require('./packet')
const Identifiers = require('../identifiers')

'use strict'

class ContainerClosePacket extends DataPacket {
    static NetID = Identifiers.ContainerClosePacket

    /** @type {number} */
    windowId

    encodePayload() {
        this.writeByte(this.windowId)
    }

    decodePayload() {
        this.windowId = this.readByte()
    }
}
module.exports = ContainerClosePacket
