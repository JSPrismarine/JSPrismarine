<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
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
