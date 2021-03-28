import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class PolarBear extends Entity {
    public static MOB_ID = 'minecraft:polar_bear';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
