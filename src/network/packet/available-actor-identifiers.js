const fs = require('fs');

const DataPacket = require('./packet');
const Identifiers = require('../identifiers');
const EntityIdentifiers = require('@jsprismarine/bedrock-data').entity_identifiers;

'use strict';

class AvailableActorIdentifiersPacket extends DataPacket {
    static NetID = Identifiers.AvailableActorIdentifiersPacket

    #cachedNBT

    async encodePayload() {
        this.append(this.#cachedNBT || (this.#cachedNBT = fs.readFileSync(__dirname + '/../../../node_modules/@jsprismarine/bedrock-data/resources/entity_identifiers.nbt')));
    }
}
module.exports = AvailableActorIdentifiersPacket;
