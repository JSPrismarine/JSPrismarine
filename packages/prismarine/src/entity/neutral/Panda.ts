import Entity from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class Panda extends Entity {
    public static MOB_ID = 'minecraft:panda';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
