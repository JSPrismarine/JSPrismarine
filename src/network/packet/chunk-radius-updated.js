const DataPacket = require('./Packet').default;
const Identifiers = require('../Identifiers').default;

class ChunkRadiusUpdatedPacket extends DataPacket {
    static NetID = Identifiers.ChunkRadiusUpdatedPacket;

    radius;

    encodePayload() {
        this.writeVarInt(this.radius);
    }
}
module.exports = ChunkRadiusUpdatedPacket;
