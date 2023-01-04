import Entity from '../Entity.js';
import Server from '../../Server.js';
import World from '../../world/World.js';

export default class Stray extends Entity {
    public static MOB_ID = 'minecraft:stray.js';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
