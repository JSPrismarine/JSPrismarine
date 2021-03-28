import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class Husk extends Entity {
    public static MOB_ID = 'minecraft:husk';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
