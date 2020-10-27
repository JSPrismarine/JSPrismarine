<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;


class RequestChunkRadiusPacket extends DataPacket {
    static NetID = Identifiers.RequestChunkRadiusPacket

    radius

    decodePayload() {
        this.radius = this.readVarInt();
    }
}
module.exports = RequestChunkRadiusPacket;
