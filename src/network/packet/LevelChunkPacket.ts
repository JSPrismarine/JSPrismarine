import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class LevelChunkPacket extends DataPacket {
    static NetID = Identifiers.LevelChunkPacket;

    public chunkX: number = 0;
    public chunkZ: number = 0;
    public subChunkCount: number = 0;
    public data: any;

    public encodePayload() {
        this.writeVarInt(this.chunkX);
        this.writeVarInt(this.chunkZ);
        this.writeUnsignedVarInt(this.subChunkCount);
        this.writeBool(+false); // Cached
        this.writeUnsignedVarInt(Buffer.byteLength(this.data));
        this.append(this.data);
    }
}
