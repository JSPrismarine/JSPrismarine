import type BinaryStream from '@jsprismarine/jsbinaryutils';

/**
 * 2D Vector.
 */
export class Vector2 {
    /**
     * The X coordinate.
     */
    protected x: number = 0;

    /**
     * The Z coordinate.
     */
    protected z: number = 0;

    /**
     * Create a new `Vector2` instance.
     * @constructor
     * @param {number} x - The X coordinate.
     * @param {number} z - The Z coordinate.
     * @example
     * ```typescript
     * const vector = new Vector2(10, 20);
     * ```
     */
    public constructor(x: number = 0, z: number = 0) {
        this.setX(x);
        this.setZ(z);
    }

    toString() {
        return `x: §b${this.x.toFixed(2)}§r, z: §b${this.z.toFixed(2)}§r`;
    }

    public static fromObject({ x, z }: { x: number; z: number }): Vector2 {
        return new Vector2(x, z);
    }

    /**
     * Set the X coordinate.
     * @param {number} x - The X coordinate.
     * @example
     * ```typescript
     * await entity.setX(10);
     * ```
     */
    public setX(x = 0): void {
        this.x = x;
    }

    /**
     * Set the Z coordinate.
     * @param {number} z - The Z coordinate.
     * @example
     * ```typescript
     * await entity.setZ(10);
     * ```
     */
    public setZ(z = 0): void {
        this.z = z;
    }

    /**
     * Get the x coordinate.
     * @returns {number} The x coordinate's value.
     */
    public getX(): number {
        return this.x;
    }

    /**
     * Get the z coordinate.
     * @returns {number} The z coordinate's value.
     */
    public getZ(): number {
        return this.z;
    }

    public floor = () => new Vector2(Math.floor(this.x), Math.floor(this.z));

    /**
     * Compare an instance of `Vector3` with another.
     * @param {Vector2} vector - The `Vector3` to compare to.
     * @returns {boolean} `true` if they're equal otherwise `false`.
     */
    public equals(vector: Vector2): boolean {
        return JSON.stringify(this) === JSON.stringify(vector);
    }

    /**
     * Serialize this `Vector3` instance into a `BinaryStream`.
     * @param {BinaryStream} stream - The network stream.
     */
    public networkSerialize(stream: BinaryStream): void {
        stream.writeFloatLE(this.x);
        stream.writeFloatLE(this.z);
    }

    /**
     * Deserialize a `Vector3` from a `BinaryStream`.
     * @param {BinaryStream} stream - The network stream.
     * @returns {Vector2} The deserialized `Vector3`.
     */
    public static networkDeserialize(stream: BinaryStream): Vector2 {
        return new Vector2(stream.readFloatLE(), stream.readFloatLE());
    }
}
