import Entity from '../Entity.js';
import Server from '../../Server.js';
import World from '../../world/World.js';

export default class Balloon extends Entity {
    public static MOB_ID = 'minecraft:balloon';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
