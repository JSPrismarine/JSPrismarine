const fs = require('fs')

const DataPacket = require("./data_packet");
const Identifiers = require('../identifiers');

'use strict'

class BiomeDefinitionListPacket extends DataPacket {
    static NetID = Identifiers.BiomeDefinitionListPacket

    #cachedNBT

    encodePayload() {
        this.append(this.#cachedNBT ||
            (this.#cachedNBT = fs.readFileSync(__dirname + '/../../resources/biome_definitions.nbt')))
    }
}
module.exports = BiomeDefinitionListPacket