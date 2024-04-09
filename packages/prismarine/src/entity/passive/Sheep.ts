import Entity from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class Sheep extends Entity {
    public static MOB_ID = 'minecraft:sheep';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
