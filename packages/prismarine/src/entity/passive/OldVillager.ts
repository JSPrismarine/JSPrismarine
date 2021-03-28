import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class OldVillager extends Entity {
    public static MOB_ID = 'minecraft:villager';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
