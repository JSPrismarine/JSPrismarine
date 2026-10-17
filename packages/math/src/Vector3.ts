import { Vector2 } from './Vector2';

/**
 * 3D Vector.
 */
export class Vector3 extends Vector2 {
    /**
     * Returns a Vector3 with 0 on all axis.
     */
    public static get ZERO(): Vector3 {
        return new Vector3(0, 0, 0);
    }

    /**
     * Create a new `Vector3` instance.
     * @param {number} x - The X coordinate.
     * @param {number} y - The Y coordinate.
     * @param {number} z - The Z coordinate.
     * @example
     * ```typescript
     * const vector = new Vector3(10, 20, 30);
     * ```
     */
    public constructor(
        x: number,
        protected readonly y: number,
        z: number
    ) {
        super(x, z);
    }

    public toString(): string {
        return `x: §b${this.x.toFixed(2)}§r, y: §b${this.y.toFixed(2)}§r, z: §b${this.z.toFixed(2)}§r`;
    }

    /**
     * Creates a new Vector3 instance from an object with x, y, and z properties.
     * @param obj - The object containing x, y, and z properties.
     * @returns {Vector3} A new Vector3 instance.
     */
    public static fromObject({ x, y, z }: { x: number; y: number; z: number }): Vector3 {
        return new Vector3(x, y, z);
    }

    /**
     * Builds another instance of whatever class this actually is, from raw coordinates.
     *
     * Every method that derives a new vector goes through here, so a subclass keeps its own
     * type instead of decaying to a plain `Vector3` - and a subclass carrying extra state,
     * such as a position carrying its world, gets one place to reattach it.
     * @param {number} x - The X coordinate.
     * @param {number} y - The Y coordinate.
     * @param {number} z - The Z coordinate.
     * @returns {this} A new instance of the concrete class.
     */
    protected create(x: number, y: number, z: number): this {
        return new (this.constructor as new (x: number, y: number, z: number) => this)(x, y, z);
    }

    /**
     * Returns a copy with a different X coordinate.
     * @param {number} x - The X coordinate.
     * @returns {this} A new vector; this one is left alone.
     * @example
     * ```typescript
     * const moved = vector.withX(10);
     * ```
     */
    public override withX(x: number): this {
        return this.create(x, this.y, this.z);
    }

    /**
     * Returns a copy with a different Y coordinate.
     * @param {number} y - The Y coordinate.
     * @returns {this} A new vector; this one is left alone.
     * @example
     * ```typescript
     * const moved = vector.withY(10);
     * ```
     */
    public withY(y: number): this {
        return this.create(this.x, y, this.z);
    }

    /**
     * Returns a copy with a different Z coordinate.
     * @param {number} z - The Z coordinate.
     * @returns {this} A new vector; this one is left alone.
     * @example
     * ```typescript
     * const moved = vector.withZ(10);
     * ```
     */
    public override withZ(z: number): this {
        return this.create(this.x, this.y, z);
    }

    /**
     * Get the y coordinate.
     * @returns {number} The y coordinate's value.
     */
    public getY(): number {
        return this.y;
    }

    /**
     * Returns a new Vector3 with each component rounded down to the nearest integer.
     * @returns {this} A new vector with rounded down components.
     */
    public override floor(): this {
        return this.create(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));
    }

    /**
     * Returns a new Vector3 with each component truncated to the nearest integer.
     * @returns {this} A new vector with truncated axis.
     */
    public override trunc(): this {
        return this.create(Math.trunc(this.x), Math.trunc(this.y), Math.trunc(this.z));
    }

    /**
     * Compare an instance of `Vector3` with another.
     * @param {Vector3} vector - The `Vector3` to compare to.
     * @returns {boolean} `true` if they're equal otherwise `false`.
     */
    public override equals(vector: Vector3): boolean {
        return this.x === vector.x && this.y === vector.y && this.z === vector.z;
    }

    /**
     * The squared distance to another vector.
     *
     * Squared, and offered first, because almost every caller compares a distance against
     * another distance - and a comparison of squares gives the same answer without the square
     * root. Prefer this to {@link Vector3.distanceTo} wherever the number itself is not shown
     * to anyone.
     * @param {Vector3} vector - The vector to measure to.
     * @returns {number} The squared distance.
     * @example
     * ```typescript
     * if (a.distanceSquaredTo(b) <= range * range) {
     *     // within range, with no square root taken
     * }
     * ```
     */
    public distanceSquaredTo(vector: Vector3): number {
        const dx = this.x - vector.x;
        const dy = this.y - vector.y;
        const dz = this.z - vector.z;
        return dx * dx + dy * dy + dz * dz;
    }

    /**
     * The distance to another vector.
     * @param {Vector3} vector - The vector to measure to.
     * @returns {number} The distance.
     * @example
     * ```typescript
     * const metres = player.getPosition().distanceTo(target.getPosition());
     * ```
     */
    public distanceTo(vector: Vector3): number {
        return Math.sqrt(this.distanceSquaredTo(vector));
    }
}
