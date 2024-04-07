import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class SkulkerBullet extends Entity {
    public static MOB_ID = 'minecraft:shulker_bullet';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
