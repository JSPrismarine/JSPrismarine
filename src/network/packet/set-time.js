<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;


class SetTimePacket extends DataPacket {
    static NetID = Identifiers.SetTimePacket

    /** @type {number} */
    time

    decodePayload() {
        this.type = this.readVarInt();
    }

    encodePayload() {
        this.writeVarInt(this.time);
    }
}
module.exports = SetTimePacket;
