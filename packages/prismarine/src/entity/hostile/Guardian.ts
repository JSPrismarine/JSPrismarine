import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class Guardian extends Entity {
    public static MOB_ID = 'minecraft:guardian';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
