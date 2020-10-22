const BiomeDefinitions = require('@jsprismarine/bedrock-data').biome_definitions;
const DataPacket = require('./Packet').default;
const Identifiers = require('../identifiers');

class BiomeDefinitionListPacket extends DataPacket {
    static NetID = Identifiers.BiomeDefinitionListPacket

    #cachedNBT

    encodePayload() {
        this.append(this.#cachedNBT ||
            (this.#cachedNBT = BiomeDefinitions));
    }
}
module.exports = BiomeDefinitionListPacket;
