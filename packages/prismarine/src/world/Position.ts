import { assert } from 'console';
import type { Server } from '../';
import Vector3 from '../math/Vector3';
import type { World } from './';

export default class Position extends Vector3 {
    protected readonly server: Server;

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
    public constructor({
        x,
        y,
        z,
        world,
        server
    }: {
        x?: number;
        y?: number;
        z?: number;
        world?: World;
        server: Server;
    }) {
        super(x, y, z);
        this.world = world;
        this.server = server;
    }

    toString() {
        return `${super.toString.bind(this)()}, world: §b${this.world?.getName() || 'none'}§r`;
    }

    /**
     * Get the world of the position
     * @returns {World} The world of the position.
     */
    public getWorld() {
        const world = this.world ?? this.server.getWorldManager().getDefaultWorld();
        assert(world, 'World not found');
        return world;
    }

    /**
     * Set the world of the position
     * @param {World} world - The world to set.
     */
    public async setWorld(world: World) {
        this.world = world;
    }
}
