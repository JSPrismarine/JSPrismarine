const DataPacket = require('./packet');
const Identifiers = require('../Identifiers').default;


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
