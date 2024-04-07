import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class Creeper extends Entity {
    public static MOB_ID = 'minecraft:creeper';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
