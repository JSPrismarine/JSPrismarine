import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class HopperMinecart extends Entity {
    public static MOB_ID = 'minecraft:hopper_minecart';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
