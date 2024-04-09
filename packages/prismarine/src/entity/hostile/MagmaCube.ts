import Entity from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class MagmaCube extends Entity {
    public static MOB_ID = 'minecraft:magma_cube';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
