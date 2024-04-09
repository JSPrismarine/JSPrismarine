import Entity from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class WanderingTrader extends Entity {
    public static MOB_ID = 'minecraft:wandering_trader';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
