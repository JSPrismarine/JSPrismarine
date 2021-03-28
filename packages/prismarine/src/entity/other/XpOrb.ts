import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class ExperienceOrb extends Entity {
    public static MOB_ID = 'minecraft:xp_orb';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
