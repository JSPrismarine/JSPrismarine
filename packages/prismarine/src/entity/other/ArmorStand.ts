import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class ArmorStand extends Entity {
    public static MOB_ID = 'minecraft:armor_stand';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
