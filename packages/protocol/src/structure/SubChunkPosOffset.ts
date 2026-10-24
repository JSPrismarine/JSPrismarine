import NetworkStructure from '../NetworkStructure';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * The offset of one sub chunk from a batch's center, counted in sub chunks: `Subchunk Offset
 * X`, `Subchunk Offset Y`, then `Subchunk Offset Z`, each a signed byte.
 *
 * A byte per axis limits a batch to sub chunks within 127 of the center; anything farther
 * needs a new batch with a new center.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/sub-chunk-pos-offset/}
 */
export default class SubChunkPosOffset extends NetworkStructure {
    public constructor(
        public x = 0,
        public y = 0,
        public z = 0
    ) {
        super();
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeSignedByte(this.x);
        stream.writeSignedByte(this.y);
        stream.writeSignedByte(this.z);
    }

    public deserialize(stream: NetworkBinaryStream): void {
        this.x = stream.readSignedByte();
        this.y = stream.readSignedByte();
        this.z = stream.readSignedByte();
    }
}
