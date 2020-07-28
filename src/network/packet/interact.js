const DataPacket = require('./packet')
const Identifiers = require('../identifiers')
const InteractAction = require('../type/interact-action')

'use strict'

class InteractPacket extends DataPacket {
    static NetID = Identifiers.InteractPacket

    action
    target

    x = null
    y = null
    z = null

    decodePayload() {
        this.action = this.readByte()
        this.target = this.readUnsignedVarLong()

        if (this.action == InteractAction.MouseOver) {
            this.x = this.readLFloat()
            this.y = this.readLFloat()
            this.z = this.readLFloat()
        }
    }
}
module.exports = InteractPacket