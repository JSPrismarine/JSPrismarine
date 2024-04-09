import type BinaryStream from '@jsprismarine/jsbinaryutils';
import Vec2 from './Vec2';

/**
 * Represents the network structure of a 3D vector.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/Vec3.html}
 */
export default class Vec3 extends Vec2 {
    /**
     * Creates a new instance of Vec3.
     * @param x - The x-coordinate of the vector.
     * @param y - The y-coordinate of the vector.
     * @param z - The z-coordinate of the vector.
     */
    public constructor(
        x: number,
        y: number,
        public z: number
    ) {
        super(x, y);
    }

    /**
     * Serializes the vector into a binary stream.
     * @param stream - The binary stream to write to.
     */
    public serialize(stream: BinaryStream): void {
        stream.writeFloatLE(this.x);
        stream.writeFloatLE(this.y);
        stream.writeFloatLE(this.z);
    }

    /**
     * Deserializes the vector from a binary stream.
     * @param stream - The binary stream to read from.
     */
    public deserialize(stream: BinaryStream): void {
        this.x = stream.readFloatLE();
        this.y = stream.readFloatLE();
        this.z = stream.readFloatLE();
    }
}
