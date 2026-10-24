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

        // A plain count, and then a separate optional limit. The count used to double as a
        // signal: `-2` meant "the client will ask for subchunks itself" and was followed by
        // the highest one it may ask for. At 2168 the sentinel is gone - a count is only ever
        // a count - and the limit is an optional field of its own.
        if (this.clientSubChunkRequestsEnabled) {
            this.writeUnsignedVarInt(0);
            this.writeBoolean(true);
            this.writeVarInt(this.subChunkCount);
        } else {
            this.writeUnsignedVarInt(this.subChunkCount);
            this.writeBoolean(false);
        }

        this.writeBoolean(false); // Cache enabled

        // The blob hashes, now written unconditionally rather than only when the cache is on.
        // Empty is still a length, and leaving it out costs the client the first byte of the
        // payload that follows.
        this.writeUnsignedVarInt(0);

        this.writeUnsignedVarInt(Buffer.byteLength(this.data));
        this.write(this.data);
    }
}
