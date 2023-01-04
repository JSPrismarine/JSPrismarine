import Entity from '../Entity.js';
import Server from '../../Server.js';
import World from '../../world/World.js';

export default class OldZombieVillager extends Entity {
    public static MOB_ID = 'minecraft:zombie_villager.js';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
