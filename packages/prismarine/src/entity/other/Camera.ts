import Entity from '../Entity.js';
import Server from '../../Server.js';
import World from '../../world/World.js';

export default class Camera extends Entity {
    public static MOB_ID = 'minecraft:tripod_camera.js';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
