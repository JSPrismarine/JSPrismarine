import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';

/**
 * A chunk column position: `X` then `Z`, both ZigZag varint32, counted in chunks.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/chunk-pos/}
 */
export class ChunkPos extends NetworkStructure {
    public constructor(
        public cx: number,
        public cz: number
    ) {
        super();
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeVarInt(this.cx);
        stream.writeVarInt(this.cz);
    }

    public deserialize(stream: NetworkBinaryStream): void {
        this.cx = stream.readVarInt();
        this.cz = stream.readVarInt();
    }
}
