import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class LeashKnot extends Entity {
    public static MOB_ID = 'minecraft:leash_knot';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
