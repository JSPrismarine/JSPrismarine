import Entity from '../Entity.js';
import Server from '../../Server.js';
import World from '../../world/World.js';

export default class CommandBlockMinecart extends Entity {
    public static MOB_ID = 'minecraft:command_block_minecart';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
