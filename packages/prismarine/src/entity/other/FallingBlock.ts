import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class FallingBlock extends Entity {
    public static MOB_ID = 'minecraft:falling_block';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
