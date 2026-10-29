import DataPacket from './DataPacket';

/**
 * Sends one chunk column to the client. Protocol 2193 writes it as:
 *
 * 1. Chunk Position: X varint32 then Z varint32, both ZigZag.
 * 2. Dimension Id: varint32.
 * 3. Sub-chunks Count: varuint32.
 * 4. Client Request SubChunk Limit: optional varint32. One presence byte, then the value
 *    only when present. Present only in request mode, where the count above is 0.
 * 5. Cache Enabled: boolean.
 * 6. Cache Metadata: varuint32 count, then one Blob Id uint64 per entry. Always written,
 *    empty when the cache is off.
 * 7. Serialized Chunk Data: varuint32 byte length, then the raw bytes.
 */
export default class LevelChunkPacket extends DataPacket {
    /** Chunk Position X, in chunks. */
    public chunkX = 0;

    /** Chunk Position Z, in chunks. */
    public chunkZ = 0;

    /** Dimension Id of the chunk. 0 is the Overworld, 1 the Nether, 2 the End. */
    public dimension = 0;

    /**
     * Sub-chunks Count in plain mode. In request mode this is the Client Request SubChunk
     * Limit instead, the highest sub-chunk the client may ask for, and the count goes out as 0.
     */
    public subChunkCount = 0;

    /**
     * Whether the client fetches the sub-chunks itself through `SubChunkRequestPacket`.
     * Controls whether the Client Request SubChunk Limit is present.
     */
    public clientSubChunkRequestsEnabled = false;

    /** Serialized Chunk Data, the bytes `Chunk.networkSerialize` produces. */
    public data: Buffer = Buffer.alloc(0);

    public encodePayload(): void {
        this.writeVarInt(this.chunkX);
        this.writeVarInt(this.chunkZ);

        this.writeVarInt(this.dimension);

        // A plain count, then a separate optional limit. The count used to double as a signal.
        // A count of -2 meant the client would ask for sub-chunks itself and was followed by
        // the highest one it could ask for. Since 2168 a count is only a count and the limit
        // is an optional field of its own.
        if (this.clientSubChunkRequestsEnabled) {
            this.writeUnsignedVarInt(0);
            this.writeBoolean(true);
            this.writeVarInt(this.subChunkCount);
        } else {
            this.writeUnsignedVarInt(this.subChunkCount);
            this.writeBoolean(false);
        }

        // Cache Enabled. The server does not use the client blob cache.
        this.writeBoolean(false);

        // Cache Metadata. The list goes out even when the cache is off. An empty list is still
        // a count byte, and leaving it out makes the client read the payload length as a count.
        this.writeUnsignedVarInt(0);

        this.writeUnsignedVarInt(this.data.byteLength);
        this.write(this.data);
    }

    /**
     * Reads the seven fields back, the mirror of {@link encodePayload}.
     *
     * Cache Metadata blob ids are read past rather than kept: the server never enables the
     * blob cache, so there is nothing to hold them for, but they still have to come off the
     * stream for the chunk data behind them to be read from the right place.
     */
    public decodePayload(): void {
        this.chunkX = this.readVarInt();
        this.chunkZ = this.readVarInt();

        this.dimension = this.readVarInt();

        const subChunkCount = this.readUnsignedVarInt();
        this.clientSubChunkRequestsEnabled = this.readBoolean();
        this.subChunkCount = this.clientSubChunkRequestsEnabled ? this.readVarInt() : subChunkCount;

        this.readBoolean(); // Cache Enabled, always written as false.

        for (let i = 0, count = this.readUnsignedVarInt(); i < count; i++) {
            this.readLongLE(); // Cache Metadata: Blob Id.
        }

        this.data = this.read(this.readUnsignedVarInt());
    }
}
