const DataPacket = require('./packet');
const Identifiers = require('../Identifiers').default;


class RemoveActorPacket extends DataPacket {
    static NetID = Identifiers.RemoveActorPacket

    uniqueEntityId

    encodePayload() {
        this.writeVarLong(this.uniqueEntityId);
    }
}
module.exports = RemoveActorPacket;
