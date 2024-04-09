import Entity from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class CaveSpider extends Entity {
    public static MOB_ID = 'minecraft:cave_spider';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
