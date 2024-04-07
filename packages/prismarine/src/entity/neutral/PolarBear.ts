import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class PolarBear extends Entity {
    public static MOB_ID = 'minecraft:polar_bear';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
