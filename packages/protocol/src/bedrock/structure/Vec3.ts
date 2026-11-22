import type BinaryStream from '@jsprismarine/binaryutils';
import Vec2 from './Vec2';

/**
 * Represents the network structure of a 3D vector.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/vec3/}
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
     * Writes the vector as three little-endian floats, x, y then z.
     * @param stream - The binary stream to write to.
     */
    public override write(stream: BinaryStream): void {
        stream.writeFloatLE(this.x);
        stream.writeFloatLE(this.y);
        stream.writeFloatLE(this.z);
    }

    /**
     * Reads the vector from three little-endian floats, x, y then z.
     * @param stream - The binary stream to read from.
     */
    public override read(stream: BinaryStream): void {
        this.x = stream.readFloatLE();
        this.y = stream.readFloatLE();
        this.z = stream.readFloatLE();
    }
}
