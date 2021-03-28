import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class FireworksRocket extends Entity {
    public static MOB_ID = 'minecraft:fireworks_rocket';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
