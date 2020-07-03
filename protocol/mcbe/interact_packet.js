const DataPacket = require("./data_packet")

'use strict'

const InteractAction = {
    LeaveVehicle: 3,
    MouseOver: 4,
    OpenNPC: 5,
    OpneInventory: 6
}
class InteractPacket extends DataPacket {
    static NetID = 0x21  // TODO

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
module.exports = { InteractPacket, InteractAction }