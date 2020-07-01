const DataPacket = require("./data_packet")

'use strict'

class ResourcePackStackPacket extends DataPacket {
    static NetID = 0x07  // TODO

    mustAccept = false

    behaviorPackStack = []
    resourcePackStack = []

    experimental = false
    vanillaVersion = '1.16.0'  // Soon fix

    encodePayload() {
        this.writeBool(this.mustAccept)

        this.writeUnsignedVarInt(this.behaviorPackStack.length)
        // for (let behaviorPackStack of this.behaviorPackStack) {
            // TODO: not needed for now
        // }

        this.writeUnsignedVarInt(this.resourcePackStack.length)
        // for (let resourcePackStack of this.resourcePackStack) {
            // TODO: not needed for now
        // }

        this.writeBool(this.experimental)
        this.writeString(this.vanillaVersion)
    }
}
module.exports = ResourcePackStackPacket