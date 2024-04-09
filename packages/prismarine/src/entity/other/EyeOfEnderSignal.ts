import Entity from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class EyeOfEnderSignal extends Entity {
    public static MOB_ID = 'minecraft:eye_of_ender_signal';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
