import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class Tnt extends Entity {
    public static MOB_ID = 'minecraft:tnt';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
