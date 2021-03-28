import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class Ravager extends Entity {
    public static MOB_ID = 'minecraft:ravager';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
