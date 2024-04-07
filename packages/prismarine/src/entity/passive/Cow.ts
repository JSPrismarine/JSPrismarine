import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class Cow extends Entity {
    public static MOB_ID = 'minecraft:cow';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
