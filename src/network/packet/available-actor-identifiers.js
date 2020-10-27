<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;
const EntityIdentifiers = require('@jsprismarine/bedrock-data').entity_identifiers;

class AvailableActorIdentifiersPacket extends DataPacket {
    static NetID = Identifiers.AvailableActorIdentifiersPacket

    #cachedNBT

    async encodePayload() {
        this.append(this.#cachedNBT || (this.#cachedNBT = EntityIdentifiers));
    }
}
module.exports = AvailableActorIdentifiersPacket;
