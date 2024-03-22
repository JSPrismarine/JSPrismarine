import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class LeashKnot extends Entity {
    public static MOB_ID = 'minecraft:leash_knot';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
