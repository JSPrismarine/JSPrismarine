const DataPacket = require('./packet');
const Identifiers = require('../Identifiers').default;


class LevelChunkPacket extends DataPacket {
    static NetID = Identifiers.LevelChunkPacket

    chunkX
    chunkZ
    subChunkCount
    data

    encodePayload() {
        this.writeVarInt(this.chunkX);
        this.writeVarInt(this.chunkZ);
        this.writeUnsignedVarInt(this.subChunkCount);
        this.writeBool(false);  // Cached
        this.writeUnsignedVarInt(Buffer.byteLength(this.data));
        this.append(this.data);
    }
}
module.exports = LevelChunkPacket;
