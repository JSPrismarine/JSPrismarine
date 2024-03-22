import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class OldZombieVillager extends Entity {
    public static MOB_ID = 'minecraft:zombie_villager';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
