import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class ElderGuardian extends Entity {
    public static MOB_ID = 'minecraft:elder_guardian';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
