import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class IronGolem extends Entity {
    public static MOB_ID = 'minecraft:iron_golem';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
