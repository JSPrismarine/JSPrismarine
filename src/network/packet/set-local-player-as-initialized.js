const DataPacket = require('./Packet').default;
const Identifiers = require('../identifiers');


class SetLocalPlayerAsInitializedPacket extends DataPacket {
    static NetID = Identifiers.SetLocalPlayerAsInitializedPacket

    runtimeEntityId

    decodePayload() {
        this.runtimeEntityId = this.readUnsignedVarLong();
    }
}
module.exports = SetLocalPlayerAsInitializedPacket;
