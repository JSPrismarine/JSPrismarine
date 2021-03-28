import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class CaveSpider extends Entity {
    public static MOB_ID = 'minecraft:cave_spider';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
