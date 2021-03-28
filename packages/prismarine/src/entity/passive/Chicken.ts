import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class Chicken extends Entity {
    public static MOB_ID = 'minecraft:chicken';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
