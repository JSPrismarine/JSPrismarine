import DataPacket from './DataPacket';

/**
 * The radius the server grants, which is the one that binds.
 *
 * Protocol 2193 carries a single field, `Chunk Radius`, a ZigZag varint32 counted in chunks. It
 * answers `RequestChunkRadiusPacket` and may be smaller than what the client asked for. Until it
 * arrives a retail client discards every `LevelChunkPacket` it is sent.
 *
 * **Bound To:** Client
 */
export default class ChunkRadiusUpdatedPacket extends DataPacket {
    /** `Chunk Radius`, the granted view distance in chunks. */
    public radius!: number;

    /** Writes `Chunk Radius` as a ZigZag varint32. */
    public encodePayload(): void {
        this.writeVarInt(this.radius);
    }

    /** Reads `Chunk Radius` as a ZigZag varint32. */
    public decodePayload(): void {
        this.radius = this.readVarInt();
    }
}
