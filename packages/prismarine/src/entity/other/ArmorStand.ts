import { Entity } from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class ArmorStand extends Entity {
    public static MOB_ID = 'minecraft:armor_stand';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
