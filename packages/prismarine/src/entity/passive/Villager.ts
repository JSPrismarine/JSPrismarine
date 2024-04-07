import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class Villager extends Entity {
    public static MOB_ID = 'minecraft:villager_v2';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
