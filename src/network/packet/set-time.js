const DataPacket = require('./Packet').default;
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
