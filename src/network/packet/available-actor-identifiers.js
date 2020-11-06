const DataPacket = require('./Packet').default;
const Identifiers = require('../Identifiers').default;
const EntityIdentifiers = require('@jsprismarine/bedrock-data')
    .entity_identifiers;

class AvailableActorIdentifiersPacket extends DataPacket {
    static NetID = Identifiers.AvailableActorIdentifiersPacket;

    #cachedNBT;

    async encodePayload() {
        this.append(this.#cachedNBT || (this.#cachedNBT = EntityIdentifiers));
    }
}
module.exports = AvailableActorIdentifiersPacket;
