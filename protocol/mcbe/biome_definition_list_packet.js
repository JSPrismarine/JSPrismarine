const fs = require('fs')

const DataPacket = require("./data_packet");

'use strict'

class BiomeDefinitionListPacket extends DataPacket {
    static NetID = 0x7a

    #cachedNBT

    encodePayload() {
        this.append(this.#cachedNBT ||
            (this.#cachedNBT = fs.readFileSync(__dirname + '/../../resources/biome_definitions.nbt')))
    }
}
module.exports = BiomeDefinitionListPacket