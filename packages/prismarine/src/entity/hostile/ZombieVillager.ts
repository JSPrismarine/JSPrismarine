import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class ZombieVillager extends Entity {
    public static MOB_ID = 'minecraft:zombie_villager_v2';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
