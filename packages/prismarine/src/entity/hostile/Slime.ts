import Entity from '../Entity.js';
import Server from '../../Server.js';
import World from '../../world/World.js';

export default class Slime extends Entity {
    public static MOB_ID = 'minecraft:slime.js';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
