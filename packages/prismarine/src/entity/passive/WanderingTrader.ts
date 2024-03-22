import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class WanderingTrader extends Entity {
    public static MOB_ID = 'minecraft:wandering_trader';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
