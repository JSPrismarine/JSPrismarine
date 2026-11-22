import type BinaryStream from '@jsprismarine/binaryutils';
import type NetworkBinaryStream from '../../NetworkBinaryStream';
import NetworkStructure from '../../NetworkStructure';

/**
 * Represents the network structure of a 2D vector.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/vec2/}
 *
 * The vector types encode only fixed-width numbers, so their codec lives in {@link Vec2.write}
 * and {@link Vec2.read}, which take any `BinaryStream`. `serialize` and `deserialize` keep the
 * signatures of {@link NetworkStructure} and delegate to them.
 */
export default class Vec2 extends NetworkStructure {
    /**
     * Creates a new instance of Vec2.
     * @param x - The x-coordinate of the vector.
     * @param y - The y-coordinate of the vector.
     */
    public constructor(
        public x: number,
        public y: number
    ) {
        super();
    }

    /**
     * Writes the vector as two little-endian floats, x then y.
     * @param stream - The binary stream to write to.
     */
    public write(stream: BinaryStream): void {
        stream.writeFloatLE(this.x);
        stream.writeFloatLE(this.y);
    }

    /**
     * Reads the vector from two little-endian floats, x then y.
     * @param stream - The binary stream to read from.
     */
    public read(stream: BinaryStream): void {
        this.x = stream.readFloatLE();
        this.y = stream.readFloatLE();
    }

    /**
     * Serializes the vector into a network stream with {@link Vec2.write}.
     * @param stream - The network stream to serialize into.
     */
    public serialize(stream: NetworkBinaryStream): void {
        this.write(stream);
    }

    /**
     * Deserializes the vector from a network stream with {@link Vec2.read}.
     * @param stream - The network stream to deserialize from.
     */
    public deserialize(stream: NetworkBinaryStream): void {
        this.read(stream);
    }
}
