import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class Vindicator extends Entity {
    public static MOB_ID = 'minecraft:vindicator';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
