import { layoutAt, networkChunkPublisherUpdatePacket } from '@jsprismarine/protocol';

import BlockPosition from '../../world/BlockPosition';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/** One entry of `Server Built Chunks List`: the docs' `ChunkPos`, an X and a Z in chunks. */
export interface ChunkCoord {
    /** `X` of the chunk column. */
    x: number;
    /** `Z` of the chunk column. */
    z: number;
}

/**
 * Moves the point the client keeps chunks loaded around. Nothing renders until one arrives.
 *
 * Protocol 2193 wire order, with the docs' field names: `New position for view` (a `BlockPos`,
 * three ZigZag varint32s), `New radius for view` (varuint32, counted in blocks rather than
 * chunks) and `Server Built Chunks List` (an unsigned int32 little endian count, which the docs
 * mark "No size compression", then one `ChunkPos` of two ZigZag varint32s per entry).
 *
 * The list names the chunks the server will build for a client that generates terrain itself. An
 * empty list is not an omission: the client treats whatever it is given as the complete set, so
 * naming only the chunks of the current batch un-renders everything sent before it. What governs
 * visibility is the radius around the position.
 *
 * **Bound To:** Client
 */
export default class NetworkChunkPublisherUpdatePacket extends FieldNetworkPacket {
    /** `New position for view`, normally the player's own position. */
    public position!: BlockPosition;
    /** `New radius for view`, in blocks: the chunk radius shifted left by four. */
    public radius!: number;
    /** `Server Built Chunks List`. Empty unless the client generates its own terrain. */
    public savedChunks!: ChunkCoord[];

    /** Writes the three fields in the protocol 2193 order described on the class. */
    public override encodePayload(): void {
        layoutAt(networkChunkPublisherUpdatePacket, this.codecProtocol).encode(this, {
            position: { x: this.position.getX(), y: this.position.getY(), z: this.position.getZ() },
            radius: this.radius,
            savedChunks: this.savedChunks.map(({ x, z }) => ({ x, z }))
        });
    }

    /** Reads the three fields back, the mirror of {@link encodePayload}. */
    public override decodePayload(): void {
        const read = layoutAt(networkChunkPublisherUpdatePacket, this.codecProtocol).decode(this);
        this.position = new BlockPosition(read.position.x, read.position.y, read.position.z);
        this.radius = read.radius;
        this.savedChunks = read.savedChunks.map((chunk) => ({ x: Number(chunk.x), z: Number(chunk.z) }));
    }
}
