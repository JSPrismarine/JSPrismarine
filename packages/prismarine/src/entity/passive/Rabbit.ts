import Entity from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class Rabbit extends Entity {
    public static MOB_ID = 'minecraft:rabbit';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
