import Entity from '../Entity.js';
import Server from '../../Server.js';
import World from '../../world/World.js';

export default class Endermite extends Entity {
    public static MOB_ID = 'minecraft:endermite';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
