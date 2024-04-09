import Entity from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class FishingHook extends Entity {
    public static MOB_ID = 'minecraft:fishing_hook';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
