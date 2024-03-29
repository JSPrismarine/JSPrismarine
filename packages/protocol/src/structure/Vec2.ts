import type BinaryStream from '@jsprismarine/jsbinaryutils';
import NetworkStructure from '../NetworkStructure';

/**
 * Represents the network structure of a 2D vector.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/Vec2.html}
 */
export default class Vec2 extends NetworkStructure {
    /**
     * Creates a new instance of Vec2.
     * @param x The x-coordinate of the vector.
     * @param y The y-coordinate of the vector.
     */
    public constructor(
        protected x: number,
        protected y: number
    ) {
        super();
    }

    /**
     * Serializes the vector into a binary stream.
     * @param stream The binary stream to serialize into.
     */
    public serialize(stream: BinaryStream): void {
        stream.writeFloatLE(this.x);
        stream.writeFloatLE(this.y);
    }

    /**
     * Deserializes the vector from a binary stream.
     * @param stream The binary stream to deserialize from.
     */
    public deserialize(stream: BinaryStream): void {
        this.x = stream.readFloatLE();
        this.y = stream.readFloatLE();
    }
}
