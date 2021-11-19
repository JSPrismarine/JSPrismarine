import BinaryStream from '@jsprismarine/jsbinaryutils';

/**
 * 3D Vector.
 * @public
 */
export default class Vector3 {
    /**
     * Creates a 3D Vector.
     * @param x - the X coordinate.
     * @param y - the Y coordinate.
     * @param z - the Z coordinate.
     */
    public constructor(protected x = 0, protected y = 0, protected z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    /**
     * Set the X coordinate.
     * @param x The x value
     */
    public setX(x: number): void {
        this.x = x;
    }

    /**
     * Set the Y coordinate.
     * @param y The y value
     */
    public setY(y: number): void {
        this.y = y;
    }

    /**
     * Set the z coordinate
     * @param z The z value
     */
    public setZ(z: number): void {
        this.z = z;
    }

    /**
     * Get the x coordinate.
     * @returns The x coordinate's value
     */
    public getX(): number {
        return this.x;
    }

    /**
     * Get the y coordinate.
     * @returns The y coordinate's value
     */
    public getY(): number {
        return this.y;
    }

    /**
     * Get the z coordinate.
     * @returns The z coordinate's value
     */
    public getZ(): number {
        return this.z;
    }

    /**
     * Compare an instance of `Vector3` with another.
     * @param vector The `Vector3` to compare to
     * @returns `true` if they're equal otherwise `false`.
     */
    public equals(vector: Vector3): boolean {
        return JSON.stringify(this) === JSON.stringify(vector);
    }

    /**
     * Serialize this `Vector3` instance into a `BinaryStream`.
     * @param stream The network stream.
     */
    public networkSerialize(stream: BinaryStream): void {
        stream.writeFloatLE(this.x);
        stream.writeFloatLE(this.y);
        stream.writeFloatLE(this.z);
    }

    /**
     * Deserialize a `Vector3` from a `BinaryStream`.
     * @param stream The network stream.
     */
    public static networkDeserialize(stream: BinaryStream): Vector3 {
        return new Vector3(stream.readFloatLE(), stream.readFloatLE(), stream.readFloatLE());
    }
}
