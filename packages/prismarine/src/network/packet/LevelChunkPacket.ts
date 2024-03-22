import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class LevelChunkPacket extends DataPacket {
    public static NetID = Identifiers.LevelChunkPacket;

    public chunkX!: number;
    public chunkZ!: number;
    public subChunkCount!: number;
    public clientSubChunkRequestsEnabled!: boolean;
    public data: any;

    public encodePayload() {
        this.writeVarInt(this.chunkX);
        this.writeVarInt(this.chunkZ);

        // TODO: RE this part
        if (!this.clientSubChunkRequestsEnabled) {
            this.writeUnsignedVarInt(this.subChunkCount);
        } else {
            this.writeUnsignedVarInt(-2);
            this.writeShortLE(this.subChunkCount);
        }

        this.writeBoolean(false); // Cached
        this.writeUnsignedVarInt(Buffer.byteLength(this.data));
        this.write(this.data);
    }
}
