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
     * @constructor
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
        protected y: number,
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
     * Set the Y coordinate.
     * @param {number} y - The Y coordinate.
     * @example
     * ```typescript
     * entity.setY(10);
     * ```
     */
    public setY(y: number): void {
        this.y = y;
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
     * @returns {Vector3} A new Vector3 with rounded down components.
     */
    public floor(): Vector3 {
        return new Vector3(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));
    }

    /**
     * Returns a new Vector3 with each component truncated to the nearest integer.
     * @returns {Vector3} A new Vector3 with truncated axis.
     */
    public trunc(): Vector3 {
        return new Vector3(Math.trunc(this.x), Math.trunc(this.y), Math.trunc(this.z));
    }

    /**
     * Compare an instance of `Vector3` with another.
     * @param {Vector3} vector - The `Vector3` to compare to.
     * @returns {boolean} `true` if they're equal otherwise `false`.
     */
    public equals(vector: typeof this): boolean {
        return JSON.stringify(this) === JSON.stringify(vector);
    }
}
