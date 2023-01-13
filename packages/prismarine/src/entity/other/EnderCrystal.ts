import Entity from '../Entity.js';
import Server from '../../Server.js';
import World from '../../world/World.js';

export default class EnderCrystal extends Entity {
    public static MOB_ID = 'minecraft:ender_crystal';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
