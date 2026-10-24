import NetworkStructure from '../NetworkStructure';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * An absolute sub chunk position, counted in sub chunks: `Subchunk Position X`, `Subchunk
 * Position Y`, then `Subchunk Position Z`, each a little-endian int32.
 *
 * `SubChunkPacket` and `SubChunkRequestPacket` use it as the center every offset is relative
 * to. Unlike `BlockPos` and `ChunkPos`, the coordinates are not varints; the schema carries
 * no `Compression` flag and the Cereal migration at protocol 2168 moved them from ZigZag
 * varint32 to fixed int32.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/sub-chunk-pos/}
 */
export default class SubChunkPos extends NetworkStructure {
    public constructor(
        public x = 0,
        public y = 0,
        public z = 0
    ) {
        super();
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeIntLE(this.x);
        stream.writeIntLE(this.y);
        stream.writeIntLE(this.z);
    }

    public deserialize(stream: NetworkBinaryStream): void {
        this.x = stream.readIntLE();
        this.y = stream.readIntLE();
        this.z = stream.readIntLE();
    }
}
