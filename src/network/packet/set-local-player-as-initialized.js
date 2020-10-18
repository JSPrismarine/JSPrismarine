const DataPacket = require('./packet').default;
const Identifiers = require('../Identifiers').default;


class SetLocalPlayerAsInitializedPacket extends DataPacket {
    static NetID = Identifiers.SetLocalPlayerAsInitializedPacket

    runtimeEntityId

    decodePayload() {
        this.runtimeEntityId = this.readUnsignedVarLong();
    }
}
module.exports = SetLocalPlayerAsInitializedPacket;
