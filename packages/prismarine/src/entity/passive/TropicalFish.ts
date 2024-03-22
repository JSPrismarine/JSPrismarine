import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class TropicalFish extends Entity {
    public static MOB_ID = 'minecraft:tropicalfish';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
