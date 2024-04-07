import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class Zombie extends Entity {
    public static MOB_ID = 'minecraft:zombie';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
