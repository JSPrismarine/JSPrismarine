import Entity from '../Entity.js';
import Server from '../../Server.js';
import World from '../../world/World.js';

export default class AreaEffectCloud extends Entity {
    public static MOB_ID = 'minecraft:area_effect_cloud';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
