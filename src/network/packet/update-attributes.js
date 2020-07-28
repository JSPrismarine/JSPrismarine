const DataPacket = require('./packet')
const Identifiers = require('../identifiers')

'use strict'

class UpdateAttributesPacket extends DataPacket {
    static NetID = Identifiers.UpdateAttributesPacket

    /** @type {number} */
    runtimeEntityId
    attributes = []

    encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId)
        this.writeAttributes(this.attributes)
    }
}
module.exports = UpdateAttributesPacket