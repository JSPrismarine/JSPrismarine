import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class ElderGuardianGhost extends Entity {
    public static MOB_ID = 'minecraft:elder_guardian_ghost';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
