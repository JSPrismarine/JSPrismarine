import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class EyeOfEnderSignal extends Entity {
    public static MOB_ID = 'minecraft:eye_of_ender_signal';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
