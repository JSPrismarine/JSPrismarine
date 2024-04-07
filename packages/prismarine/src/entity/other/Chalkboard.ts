import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class Chalkboard extends Entity {
    public static MOB_ID = 'minecraft:chalkboard';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
