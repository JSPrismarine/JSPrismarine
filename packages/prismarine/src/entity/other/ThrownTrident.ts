import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class ThrownTrident extends Entity {
    public static MOB_ID = 'minecraft:thrown_trident';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
