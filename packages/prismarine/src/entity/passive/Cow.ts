import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class Cow extends Entity {
    public static MOB_ID = 'minecraft:cow';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
