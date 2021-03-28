import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class Endermite extends Entity {
    public static MOB_ID = 'minecraft:endermite';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
