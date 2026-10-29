import DataPacket from './DataPacket';

/**
 * The client asking the server for a view distance.
 *
 * Protocol 2193 wire order, with the field names Mojang's docs use: Chunk Radius (varint32,
 * ZigZag) then Max ChunkRadius (uint8). The server answers with `ChunkRadiusUpdatedPacket`,
 * and a retail client discards every `LevelChunk` that arrives before that answer.
 */
export default class RequestChunkRadiusPacket extends DataPacket {
    /** The docs' Chunk Radius: how far the client wants to see, in chunks. */
    public radius!: number;

    /**
     * The docs' Max ChunkRadius: the largest radius the client's hardware can handle, in chunks.
     * Zero means the client did not state one.
     */
    public maxRadius!: number;

    public encodePayload(): void {
        this.writeVarInt(this.radius);
        this.writeByte(this.maxRadius);
    }

    public decodePayload(): void {
        this.radius = this.readVarInt();
        this.maxRadius = this.readByte();
    }
}
