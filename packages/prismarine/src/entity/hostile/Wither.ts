import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class Wither extends Entity {
    public static MOB_ID = 'minecraft:wither';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
