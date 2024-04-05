import { Vec3 } from '../';
import type BinaryStream from '@jsprismarine/jsbinaryutils';

/**
 * Represents the network structure of a block position.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/BlockPos.html}
 */
/**
 * Represents a block position in three-dimensional space.
 * Extends the `Vec3` class.
 */
export default class BlockPos extends Vec3 {
    /**
     * Serializes the block position to a binary stream.
     * @param stream - The binary stream to write to.
     */
    public serialize(stream: BinaryStream): void {
        stream.writeVarInt(this.x);
        stream.writeVarInt(this.y);
        stream.writeVarInt(this.z);
    }

    /**
     * Deserializes the block position from a binary stream.
     * @param stream - The binary stream to read from.
     */
    public deserialize(stream: BinaryStream): void {
        this.x = stream.readVarInt();
        this.y = stream.readVarInt();
        this.z = stream.readVarInt();
    }
}
