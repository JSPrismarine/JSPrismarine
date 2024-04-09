import Entity from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class ElderGuardian extends Entity {
    public static MOB_ID = 'minecraft:elder_guardian';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
