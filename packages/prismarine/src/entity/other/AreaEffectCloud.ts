import Entity from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class AreaEffectCloud extends Entity {
    public static MOB_ID = 'minecraft:area_effect_cloud';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
