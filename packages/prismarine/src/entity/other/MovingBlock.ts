import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class MovingBlock extends Entity {
    public static MOB_ID = 'minecraft:moving_block';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
