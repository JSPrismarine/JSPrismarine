import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class SnowGolem extends Entity {
    public static MOB_ID = 'minecraft:snow_golem';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
