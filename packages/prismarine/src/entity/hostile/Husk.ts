import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class Husk extends Entity {
    public static MOB_ID = 'minecraft:husk';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
