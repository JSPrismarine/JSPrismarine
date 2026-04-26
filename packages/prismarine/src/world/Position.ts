import { Vector3 } from '@jsprismarine/math';
import type { World } from './';

/**
 * Represents the coordinates of a Vector3 in a given World.
 */
export class Position extends Vector3 {
    /**
     * Create a new position
     * @constructor
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
        private world: World
    ) {
        // TODO: assert the world exists and is loaded
        super(x, y, z);
    }

    public toString(): string {
        return `${super.toString()}, world: §b${this.world.getName()}§r`;
    }

    public static fromVector3(vector: Vector3, world: World): Position {
        return new Position(vector.getX(), vector.getY(), vector.getZ(), world);
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
     * Set the world of the position.
     * @param {World} world - The world to set.
     */
    public setWorld(world: World): void {
        this.world = world;
    }
}
