const DataPacket = require('./packet');
const Identifiers = require('../identifiers');
const UUID = require('../../utils/uuid');

'use strict';

class EmoteListPacket extends DataPacket {
    static NetID = Identifiers.EmoteListPacket

    /** @type {number} */
    runtimeId
    /** @type {Set<UUID>} */
    emoteIds = new Set()

    decodePayload() {
        this.runtimeId = this.readUnsignedVarInt();
        let emoteCount = this.readUnsignedVarInt();
        for (let i = 0; i < emoteCount; i++) {
            this.emoteIds.add(this.readUUID());
        }
    }
}
module.exports = EmoteListPacket;