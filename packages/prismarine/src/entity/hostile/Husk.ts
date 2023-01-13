import Entity from '../Entity.js';
import Server from '../../Server.js';
import World from '../../world/World.js';

export default class Husk extends Entity {
    public static MOB_ID = 'minecraft:husk';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
