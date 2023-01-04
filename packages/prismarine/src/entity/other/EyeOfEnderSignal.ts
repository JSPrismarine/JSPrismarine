import Entity from '../Entity.js';
import Server from '../../Server.js';
import World from '../../world/World.js';

export default class EyeOfEnderSignal extends Entity {
    public static MOB_ID = 'minecraft:eye_of_ender_signal.js';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
