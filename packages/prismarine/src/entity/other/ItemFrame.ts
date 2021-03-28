import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class ItemFrame extends Entity {
    public static MOB_ID = 'minecraft:frame';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
