<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
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
