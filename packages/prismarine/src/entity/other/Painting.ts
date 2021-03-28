import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class Painting extends Entity {
    public static MOB_ID = 'minecraft:painting';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
