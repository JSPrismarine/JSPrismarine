const DataPacket = require("./data_packet")
const Identifiers = require("../identifiers")

'use strict'

const AnimateAction = {
    SwingArm: 1,
    StopSleep: 3,
    CriticalHit: 4,
    MagicalCriticalHit: 5,
    RowRight: 128,
    RowLeft: 129
}
class AnimatePacket extends DataPacket {
    static NetID = Identifiers.AnimatePacket

    action
    runtimeEntityId
    boatRowingTime = null

    decodePayload() {
        this.action = this.readVarInt()
        this.runtimeEntityId = this.readUnsignedVarLong()
        if ((this.action & 0x80) !== 0) {
            this.boatRowingTime = this.readLFloat()
        }
    }
}
module.exports = { AnimatePacket, AnimateAction }