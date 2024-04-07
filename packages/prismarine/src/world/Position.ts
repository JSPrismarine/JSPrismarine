import Vector3 from '../math/Vector3';
import type World from './World';

export interface PositionData {
    x?: number;
    y?: number;
    z?: number;
    world?: World;
}

export default class Position extends Vector3 {
    private world?: World;

    /**
     * Create a new position
     * @constructor
     * @param {PositionData} data - The data to create the position.
     * @param {number} data.x - The x coordinate of the position.
     * @param {number} data.y - The y coordinate of the position.
     * @param {number} data.z - The z coordinate of the position.
     * @param {World} data.world - The world of the position.
     * @returns {Position} The new position.
     */
    public constructor({ x, y, z, world }: PositionData = {}) {
        super(x, y, z);
        this.world = world;
    }

    /**
     * Get the world of the position
     * @returns {World} The world of the position.
     */
    public getWorld() {
        return this.world!;
    }

    /**
     * Set the world of the position
     * @param {World} world - The world to set.
     */
    public async setWorld(world: World) {
        this.world = world;
    }
}
