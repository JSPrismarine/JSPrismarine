import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class WitherSkullDangerous extends Entity {
    public static MOB_ID = 'minecraft:wither_skull_dangerous';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
