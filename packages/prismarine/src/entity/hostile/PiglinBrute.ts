import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class PiglinBrute extends Entity {
    public static MOB_ID = 'minecraft:piglin_brute';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
