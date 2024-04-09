import Entity from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class LightningBolt extends Entity {
    public static MOB_ID = 'minecraft:lightning_bolt';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
