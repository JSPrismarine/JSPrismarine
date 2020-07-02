const fs = require('fs')

const DataPacket = require("./data_packet")

'use strict'

class AvailableActorIdentifiersPacket extends DataPacket {
    static NetID = 0x77

    #cachedNBT

    encodePayload() {
        this.append(this.#cachedNBT ||
        (this.#cachedNBT = fs.readFileSync(__dirname + '/../../resources/entity_identifiers.nbt')))
    }
}
module.exports = AvailableActorIdentifiersPacket