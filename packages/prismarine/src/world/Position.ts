import Vector3 from '../math/Vector3';
import World from './World';

interface PositionData {
    x?: number;
    y?: number;
    z?: number;
    world: World;
}

export default class Position extends Vector3 {
    private world: World;

    public constructor({ x, y, z, world }: PositionData) {
        super(x, y, z);
        this.world = world;
    }

    public getWorld(): World {
        return this.world;
    }

    public async setWorld(world: World) {
        this.world = world;
    }
}
