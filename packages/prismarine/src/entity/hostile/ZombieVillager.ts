import Entity from '../Entity.js';
import Server from '../../Server.js';
import World from '../../world/World.js';

export default class ZombieVillager extends Entity {
    public static MOB_ID = 'minecraft:zombie_villager_v2';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
