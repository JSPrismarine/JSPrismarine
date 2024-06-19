import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class LevelChunkPacket extends DataPacket {
    public static NetID = Identifiers.LevelChunkPacket;

    public chunkX!: number;
    public chunkZ!: number;
    public subChunkCount!: number;
    public clientSubChunkRequestsEnabled!: boolean;
    public data: any;

    public encodePayload(): void {
        this.writeVarInt(this.chunkX);
        this.writeVarInt(this.chunkZ);

        this.writeVarInt(0); // DimensionID

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
