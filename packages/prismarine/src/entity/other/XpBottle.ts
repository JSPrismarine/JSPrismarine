import Entity from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class XpBottle extends Entity {
    public static MOB_ID = 'minecraft:xp_bottle';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
