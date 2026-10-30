import { layoutAt, requestChunkRadiusPacket } from '@jsprismarine/protocol';

import DataPacket from './DataPacket';

/**
 * The client asking the server for a view distance.
 *
 * The wire layout lives in `@jsprismarine/protocol`'s `requestChunkRadiusPacket` definition:
 * Chunk Radius as a ZigZag varint32, then Max ChunkRadius as a uint8. The server answers with
 * `ChunkRadiusUpdatedPacket`, and a retail client discards every `LevelChunk` that arrives
 * before that answer.
 */
export default class RequestChunkRadiusPacket extends DataPacket {
    /** The docs' Chunk Radius: how far the client wants to see, in chunks. */
    public radius!: number;

    /**
     * The docs' Max ChunkRadius: the largest radius the client's hardware can handle, in chunks.
     * Zero means the client did not state one.
     */
    public maxRadius!: number;

    /** Writes the wanted radius and the client's maximum. */
    public encodePayload(): void {
        layoutAt(requestChunkRadiusPacket, this.codecProtocol).encode(this, {
            radius: this.radius,
            maxRadius: this.maxRadius
        });
    }

    /** Reads the wanted radius and the client's maximum. */
    public decodePayload(): void {
        const read = layoutAt(requestChunkRadiusPacket, this.codecProtocol).decode(this);
        this.radius = read.radius;
        this.maxRadius = read.maxRadius;
    }
}
