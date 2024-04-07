import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class OldVillager extends Entity {
    public static MOB_ID = 'minecraft:villager';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
