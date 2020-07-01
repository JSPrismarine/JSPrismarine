const DataPacket = require("./data_packet")

'use strict'

class ResourcePacksInfoPacket extends DataPacket {
    static NetID = 0x06

    mustAccept = false
    hasScripts = false 

    behaviorPackEntries = []
    resourcePackEntries = []

    encodePayload() {
        this.writeBool(this.mustAccept)
        this.writeBool(this.hasScripts)
        this.writeLShort(this.behaviorPackEntries.length)
        for (let behaviorEntry of this.behaviorPackEntries) {
            // TODO: we don't need them for now
        }
        this.writeLShort(this.resourcePackEntries.length)
        for (let resourceEntry of this.resourcePackEntries) {
            // TODO: we don't need them for now
        }
    }
}
module.exports = ResourcePacksInfoPacket