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
     * @param {number} x - The X coordinate.
     * @param {number} z - The Z coordinate.
     * @example
     * ```typescript
     * const vector = new Vector2(10, 20);
     * ```
     */
    public constructor(
        protected readonly x: number = 0,
        protected readonly z: number = 0
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
     * Returns a copy with a different X coordinate.
     * @param {number} x - The X coordinate.
     * @returns {Vector2} A new vector; this one is left alone.
     * @example
     * ```typescript
     * const moved = vector.withX(10);
     * ```
     */
    public withX(x: number): Vector2 {
        return new Vector2(x, this.z);
    }

    /**
     * Returns a copy with a different Z coordinate.
     * @param {number} z - The Z coordinate.
     * @returns {Vector2} A new vector; this one is left alone.
     * @example
     * ```typescript
     * const moved = vector.withZ(10);
     * ```
     */
    public withZ(z: number): Vector2 {
        return new Vector2(this.x, z);
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
     * Compare an instance of `Vector2` with another.
     *
     * Compares coordinates and nothing else. The previous implementation compared
     * `JSON.stringify` of both sides, which dragged in whatever fields a subclass had
     * added - and for a subclass holding a reference back into the object graph, such as
     * a position carrying its world, serialising it threw on the circular structure.
     * @param {Vector2} vector - The `Vector2` to compare to.
     * @returns {boolean} `true` if they're equal otherwise `false`.
     */
    public equals(vector: Vector2): boolean {
        return this.x === vector.x && this.z === vector.z;
    }
}
