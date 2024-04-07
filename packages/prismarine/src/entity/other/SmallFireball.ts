import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class SmallFireball extends Entity {
    public static MOB_ID = 'minecraft:small_fireball';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
