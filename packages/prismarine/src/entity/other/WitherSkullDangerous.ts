import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class WitherSkullDangerous extends Entity {
    public static MOB_ID = 'minecraft:wither_skull_dangerous';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
