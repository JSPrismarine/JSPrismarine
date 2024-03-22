import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class Cat extends Entity {
    public static MOB_ID = 'minecraft:cat';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
