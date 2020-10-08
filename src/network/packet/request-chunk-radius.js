const DataPacket = require('./packet');
const Identifiers = require('../identifiers');


class RequestChunkRadiusPacket extends DataPacket {
    static NetID = Identifiers.RequestChunkRadiusPacket

    radius

    decodePayload() {
        this.radius = this.readVarInt();
    }
}
module.exports = RequestChunkRadiusPacket;
