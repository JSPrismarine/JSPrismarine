import type BinaryStream from '@jsprismarine/jsbinaryutils';

/**
 * 3D Vector.
 *
 * @public
 */
export default class Vector3 {
    /**
     * The X coordinate.
     */
    protected x: number = 0;

    /**
     * The Y coordinate.
     */
    protected y: number = 0;

    /**
     * The Z coordinate.
     */
    protected z: number = 0;

    /**
     * Create a new `Vector3` instance.
     * @constructor
     * @param {number} x - The X coordinate.
     * @param {number} y - The Y coordinate.
     * @param {number} z - The Z coordinate.
     * @example
     * ```typescript
     * const vector = new Vector3(10, 20, 30);
     * ```
     */
    public constructor(x: number = 0, y: number = 0, z: number = 0) {
        this.setX(x);
        this.setY(y);
        this.setZ(z);
    }

    toString() {
        return `x: §b${this.x}§r, y: §b${this.y}§r, z: §b${this.z}§r`;
    }

    public static fromObject(obj: { x: number; y: number; z: number }): Vector3 {
        return new Vector3(obj.x, obj.y, obj.z);
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
     * Set the Y coordinate.
     * @param {number} y - The Y coordinate.
     * @example
     * ```typescript
     * await entity.setY(10);
     * ```
     */
    public setY(y = 0): void {
        this.y = y;
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
     * Get the y coordinate.
     * @returns {number} The y coordinate's value.
     */
    public getY(): number {
        return this.y;
    }

    /**
     * Get the z coordinate.
     * @returns {number} The z coordinate's value.
     */
    public getZ(): number {
        return this.z;
    }

    public floor = () => new Vector3(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));

    /**
     * Compare an instance of `Vector3` with another.
     *
     * @param vector - The `Vector3` to compare to
     *
     * @returns `true` if they're equal otherwise `false`.
     */
    public equals(vector: Vector3): boolean {
        return JSON.stringify(this) === JSON.stringify(vector);
    }

    /**
     * Serialize this `Vector3` instance into a `BinaryStream`.
     * @param {BinaryStream} stream - The network stream.
     */
    public networkSerialize(stream: BinaryStream): void {
        stream.writeFloatLE(this.x);
        stream.writeFloatLE(this.y);
        stream.writeFloatLE(this.z);
    }

    /**
     * Deserialize a `Vector3` from a `BinaryStream`.
     * @param {BinaryStream} stream - The network stream.
     * @returns {Vector3} The deserialized `Vector3`.
     */
    public static networkDeserialize(stream: BinaryStream): Vector3 {
        return new Vector3(stream.readFloatLE(), stream.readFloatLE(), stream.readFloatLE());
    }
}
