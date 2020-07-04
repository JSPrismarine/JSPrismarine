const DataPacket = require("./data_packet")
const Identifiers = require("../identifiers")

'use strict'

const ResourcePackStatus = {
    Refused: 1,
    SendPacks: 2,
    HaveAllPacks: 3,
    Completed: 4
}
class ResourcePackClientResponsePacket extends DataPacket {
    static NetID = Identifiers.ResourcePackClientResponsePacket

    status
    packIds = []

    decodePayload() {
        this.status = this.readByte()
        let entryCount = this.readLShort()
        while (entryCount-- > 0) {
            this.packIds.push(this.readString())
        }
    }
}
module.exports = { ResourcePackClientResponsePacket, ResourcePackStatus }