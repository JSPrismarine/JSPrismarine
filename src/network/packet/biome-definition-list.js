const BiomeDefinitions = require('@jsprismarine/bedrock-data').biome_definitions;
<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;

class BiomeDefinitionListPacket extends DataPacket {
    static NetID = Identifiers.BiomeDefinitionListPacket

    #cachedNBT

    encodePayload() {
        this.append(this.#cachedNBT ||
            (this.#cachedNBT = BiomeDefinitions));
    }
}
module.exports = BiomeDefinitionListPacket;
