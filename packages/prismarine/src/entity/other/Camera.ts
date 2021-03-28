import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class Camera extends Entity {
    public static MOB_ID = 'minecraft:tripod_camera';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
