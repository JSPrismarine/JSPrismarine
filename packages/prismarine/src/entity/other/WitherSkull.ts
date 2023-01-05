import Entity from '../Entity.js';
import Server from '../../Server.js';
import World from '../../world/World.js';

export default class WitherSkull extends Entity {
    public static MOB_ID = 'minecraft:wither_skull';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
