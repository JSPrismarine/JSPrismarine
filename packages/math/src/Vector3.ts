import { Vector2 } from './Vector2';

/**
 * 3D Vector.
 */
export class Vector3 extends Vector2 {
    public static get ZERO(): Vector3 {
        return new Vector3(0, 0, 0);
    }

    /**
     * The Y coordinate.
     */
    protected y: number = 0;

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
    public constructor(x: number = 0, y: number = 0, z: number = 0) {
        super(x, z);
        this.setY(y);
    }

    public toString(): string {
        return `x: §b${this.x.toFixed(2)}§r, y: §b${this.y.toFixed(2)}§r, z: §b${this.z.toFixed(2)}§r`;
    }

    public static fromObject({ x, y, z }: { x: number; y: number; z: number }): Vector3 {
        return new Vector3(x, y, z);
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
     * Get the y coordinate.
     * @returns {number} The y coordinate's value.
     */
    public getY(): number {
        return this.y;
    }

    public floor(): Vector3 {
        return new Vector3(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));
    }
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
