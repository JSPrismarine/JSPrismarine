const DataPacket = require('./Packet').default;
const Identifiers = require('../Identifiers').default;


class UpdateAttributesPacket extends DataPacket {
    static NetID = Identifiers.UpdateAttributesPacket

    /** @type {number} */
    runtimeEntityId
    attributes = []

    encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeAttributes(this.attributes);
    }
}
module.exports = UpdateAttributesPacket;
