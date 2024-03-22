import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class FallingBlock extends Entity {
    public static MOB_ID = 'minecraft:falling_block';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
