import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class SkeletonHorse extends Entity {
    public static MOB_ID = 'minecraft:skeleton_horse';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
