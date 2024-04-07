import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class Endermand extends Entity {
    public static MOB_ID = 'minecraft:enderman';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
