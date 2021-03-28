import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class ZombieHorse extends Entity {
    public static MOB_ID = 'minecraft:zombie_horse';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
