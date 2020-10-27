<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;


class AnimatePacket extends DataPacket {
    static NetID = Identifiers.AnimatePacket

    action
    runtimeEntityId
    boatRowingTime = null

    encodePayload() {
        this.writeVarInt(this.action);
        this.writeUnsignedVarLong(this.runtimeEntityId);
        if ((this.action & 0x80) !== 0) {
            this.writeLFloat(this.boatRowingTime);
        }
    }

    decodePayload() {
        this.action = this.readVarInt();
        this.runtimeEntityId = this.readUnsignedVarLong();
        if ((this.action & 0x80) !== 0) {
            this.boatRowingTime = this.readLFloat();
        }
    }
}
module.exports = AnimatePacket;
