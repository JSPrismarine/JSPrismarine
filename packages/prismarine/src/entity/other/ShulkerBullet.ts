import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class SkulkerBullet extends Entity {
    public static MOB_ID = 'minecraft:shulker_bullet';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
