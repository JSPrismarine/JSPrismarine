const DataPacket = require('./packet');
const Identifiers = require('../Identifiers').default;


class ActorFallPacket extends DataPacket {
    static NetID = Identifiers.ActorFallPacket

    /** @type {number} */
    runtimeEntityId
    /** @type {number} */
    fallDistance
    /** @type {boolean} */
    inVoid

    decodePayload() {
        this.runtimeEntityId = this.readUnsignedVarLong();
        this.fallDistance = this.readLFloat();
        this.inVoid = this.readBool();
    }

    encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeLFloat(this.fallDistance);
        this.writeBool(this.inVoid);
    }
}
module.exports = ActorFallPacket;
