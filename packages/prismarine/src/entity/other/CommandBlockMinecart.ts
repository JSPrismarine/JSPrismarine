import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class CommandBlockMinecart extends Entity {
    public static MOB_ID = 'minecraft:command_block_minecart';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
