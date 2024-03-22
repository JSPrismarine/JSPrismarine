import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class Zoglin extends Entity {
    public static MOB_ID = 'minecraft:zoglin';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
