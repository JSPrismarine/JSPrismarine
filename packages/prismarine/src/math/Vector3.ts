import { Vec3 } from '@jsprismarine/protocol';

/**
 * 3D Vector.
 *
 * @public
 */
export default class Vector3 extends Vec3 {
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
     * Create a new instance of `Vector3`.
     * @param x - The x-coordinate of the vector.
     * @param y - The y-coordinate of the vector.
     * @param z - The z-coordinate of the vector.
     */
    public static fromObject(obj: { x: number; y: number; z: number }): Vector3 {
        return new Vector3(obj.x, obj.y, obj.z);
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
}
