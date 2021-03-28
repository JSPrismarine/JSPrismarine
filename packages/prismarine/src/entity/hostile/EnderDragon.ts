import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class EnderDragon extends Entity {
    public static MOB_ID = 'minecraft:ender_dragon';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
