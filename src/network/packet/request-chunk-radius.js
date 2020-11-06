const DataPacket = require('./Packet').default;
const Identifiers = require('../Identifiers').default;

class RequestChunkRadiusPacket extends DataPacket {
    static NetID = Identifiers.RequestChunkRadiusPacket;

    radius;

    decodePayload() {
        this.radius = this.readVarInt();
    }
}
module.exports = RequestChunkRadiusPacket;
