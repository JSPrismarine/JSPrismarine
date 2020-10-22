const DataPacket = require('./Packet').default;
const Identifiers = require('../identifiers');


class RemoveActorPacket extends DataPacket {
    static NetID = Identifiers.RemoveActorPacket

    uniqueEntityId

    encodePayload() {
        this.writeVarLong(this.uniqueEntityId);
    }
}
module.exports = RemoveActorPacket;
