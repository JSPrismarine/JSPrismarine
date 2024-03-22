import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class FishingHook extends Entity {
    public static MOB_ID = 'minecraft:fishing_hook';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
