<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;


class NetworkChunkPublisherUpdatePacket extends DataPacket {
    static NetID = Identifiers.NetworkChunkPublisherUpdatePacket

    x
    y
    z
    radius

    encodePayload() {
        this.writeVarInt(this.x);
        this.writeVarInt(this.y);
        this.writeVarInt(this.z);
        this.writeUnsignedVarInt(this.radius);
    }
}
module.exports = NetworkChunkPublisherUpdatePacket;
