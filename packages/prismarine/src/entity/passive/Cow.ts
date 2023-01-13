import Entity from '../Entity.js';
import Server from '../../Server.js';
import World from '../../world/World.js';

export default class Cow extends Entity {
    public static MOB_ID = 'minecraft:cow';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
