const DataPacket = require("./data_packet")

'use strict'

const ResourcePackStatus = {
    Refused: 1,
    SendPacks: 2,
    HaveAllPacks: 3,
    Completed: 4
}
class ResourcePackClientResponsePacket extends DataPacket {
    static NetID = 0x08  // TODO

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