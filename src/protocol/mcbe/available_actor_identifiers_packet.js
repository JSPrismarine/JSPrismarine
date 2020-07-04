const fs = require('fs')

const DataPacket = require("./data_packet")
const Identifiers = require('../identifiers')

'use strict'

class AvailableActorIdentifiersPacket extends DataPacket {
    static NetID = Identifiers.AvailableActorIdentifiersPacket

    #cachedNBT

    encodePayload() {
        this.append(this.#cachedNBT ||
        (this.#cachedNBT = fs.readFileSync(__dirname + '/../../resources/entity_identifiers.nbt')))
    }
}
module.exports = AvailableActorIdentifiersPacket