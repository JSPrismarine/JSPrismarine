import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class EvokerFang extends Entity {
    public static MOB_ID = 'minecraft:evocation_fang';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
