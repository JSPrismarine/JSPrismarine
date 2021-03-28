import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class Creeper extends Entity {
    public static MOB_ID = 'minecraft:creeper';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
