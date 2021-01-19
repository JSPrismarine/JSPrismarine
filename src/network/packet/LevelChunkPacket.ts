import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class LevelChunkPacket extends DataPacket {
    public static NetID = Identifiers.LevelChunkPacket;

    public chunkX!: number;
    public chunkZ!: number;
    public subChunkCount!: number;
    public data: any;

    public encodePayload() {
        this.writeVarInt(this.chunkX);
        this.writeVarInt(this.chunkZ);
        this.writeUnsignedVarInt(this.subChunkCount);
        this.writeBool(false); // Cached
        this.writeUnsignedVarInt(Buffer.byteLength(this.data));
        this.append(this.data);
    }
}
