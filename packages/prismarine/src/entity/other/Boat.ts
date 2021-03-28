import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class Boat extends Entity {
    public static MOB_ID = 'minecraft:boat';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
