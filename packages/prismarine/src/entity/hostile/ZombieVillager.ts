import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class ZombieVillager extends Entity {
    public static MOB_ID = 'minecraft:zombie_villager_v2';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
