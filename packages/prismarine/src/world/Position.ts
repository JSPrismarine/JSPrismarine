import { Vector3 } from '@jsprismarine/math';
import type { World } from './';

/**
 * Represents the coordinates of a Vector3 in a given World.
 */
export class Position extends Vector3 {
    /**
     * Create a new position
     * @param {number} x - The x coordinate of the position.
     * @param {number} y - The y coordinate of the position.
     * @param {number} z - The z coordinate of the position.
     * @param {World} world - The world of the position.
     * @returns {Position} The new position.
     */
    public constructor(
        x: number,
        y: number,
        z: number,
        private readonly world: World
    ) {
        super(x, y, z);

        // Asserted here rather than on the way out.
        //
        // A position with no world is not a position, and the old check lived in
        // `getWorld()` - which meant one could be built, stored and passed around freely,
        // and only failed at whichever unrelated read happened to touch it first. Refusing
        // to construct one names the caller that got it wrong.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!world) throw new Error('A Position requires the world it is in');
    }

    public toString(): string {
        return `${super.toString()}, world: §b${this.world.getName()}§r`;
    }

    /**
     * Creates a Position from a Vector3 and a World.
     * @param {Vector3} vector - The vector to create the position from.
     * @param {World} world - The world of the position.
     * @returns {Position} The new position.
     */
    public static fromVector3(vector: Vector3, world: World): Position {
        return new Position(vector.getX(), vector.getY(), vector.getZ(), world);
    }

    /**
     * Reattaches the world when the base class derives a new instance, so `withX` and
     * friends hand back a position rather than a bare vector missing its world.
     */
    protected override create(x: number, y: number, z: number): this {
        return new (this.constructor as new (x: number, y: number, z: number, world: World) => this)(
            x,
            y,
            z,
            this.world
        );
    }

    /**
     * Get the world of the position.
     * @returns {World} The world of the position.
     */
    public getWorld(): World {
        // TODO: assert the world is loaded, else throw
        return this.world;
    }

    /**
     * Returns the same coordinates in another world.
     * @param {World} world - The world to move to.
     * @returns {Position} A new position; this one is left alone.
     */
    public withWorld(world: World): Position {
        return new Position(this.getX(), this.getY(), this.getZ(), world);
    }
}
