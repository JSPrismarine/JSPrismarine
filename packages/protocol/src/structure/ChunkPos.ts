import type { NetworkBinaryStream } from '../';
import { NetworkStructure } from '../';

/**
 * Represents the network structure of a chunk position.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/ChunkPos.html}
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
