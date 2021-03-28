import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class Snowball extends Entity {
    public static MOB_ID = 'minecraft:snowball';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
