import Vec3 from './Vec3';
import type BinaryStream from '@jsprismarine/binaryutils';

/**
 * Represents the network structure of a block position.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/block-pos/}
 */
export default class BlockPos extends Vec3 {
    /**
     * Writes the block position as three ZigZag varints, x, y then z.
     * @param stream - The binary stream to write to.
     */
    public override write(stream: BinaryStream): void {
        stream.writeVarInt(this.x);
        stream.writeVarInt(this.y);
        stream.writeVarInt(this.z);
    }

    /**
     * Reads the block position from three ZigZag varints, x, y then z.
     * @param stream - The binary stream to read from.
     */
    public override read(stream: BinaryStream): void {
        this.x = stream.readVarInt();
        this.y = stream.readVarInt();
        this.z = stream.readVarInt();
    }
}
