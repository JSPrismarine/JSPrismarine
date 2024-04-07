import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class Zoglin extends Entity {
    public static MOB_ID = 'minecraft:zoglin';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
