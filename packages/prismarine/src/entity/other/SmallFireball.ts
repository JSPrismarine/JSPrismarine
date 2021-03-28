import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class SmallFireball extends Entity {
    public static MOB_ID = 'minecraft:small_fireball';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
