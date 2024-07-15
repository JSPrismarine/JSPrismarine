/**
 * 2D Vector.
 */
export class Vector2 {
    /**
     * Returns a Vector2 with 0 on all axis.
     */
    public static get ZERO(): Vector2 {
        return new Vector2(0, 0);
    }

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
    public constructor(
        protected x: number = 0,
        protected z: number = 0
    ) {}

    public toString(): string {
        return `x: §b${this.x.toFixed(2)}§r, z: §b${this.z.toFixed(2)}§r`;
    }

    /**
     * Creates a new Vector2 instance from an object with x and z properties.
     * @param obj - The object containing x and z properties.
     * @returns {Vector2} A new Vector2 instance.
     */
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
    public setX(x: number): void {
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
    public setZ(z: number): void {
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

    public floor(): Vector2 {
        return new Vector2(Math.floor(this.x), Math.floor(this.z));
    }

    public trunc(): Vector2 {
        return new Vector2(Math.trunc(this.x), Math.trunc(this.z));
    }
    /**
     * Compare an instance of `Vector3` with another.
     * @param {Vector2} vector - The `Vector3` to compare to.
     * @returns {boolean} `true` if they're equal otherwise `false`.
     */
    public equals(vector: Vector2): boolean {
        return JSON.stringify(this) === JSON.stringify(vector);
    }
}
