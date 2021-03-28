import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class Endermand extends Entity {
    public static MOB_ID = 'minecraft:enderman';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
