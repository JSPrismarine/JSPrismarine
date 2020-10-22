const DataPacket = require('./Packet').default;
const Identifiers = require('../identifiers');


class PacketViolationWarningPacket extends DataPacket {
    static NetID = Identifiers.PacketViolationWarningPacket

    type
    severity
    packetId
    message

    decodePayload() {
        this.type = this.readVarInt();
        this.severity = this.readVarInt();
        this.packetId = this.readVarInt();
        this.message = this.readString();
    }
}
module.exports = PacketViolationWarningPacket;
