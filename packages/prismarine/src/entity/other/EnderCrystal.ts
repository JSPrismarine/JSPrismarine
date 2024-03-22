import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class EnderCrystal extends Entity {
    public static MOB_ID = 'minecraft:ender_crystal';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
