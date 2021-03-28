import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class NPC extends Entity {
    public static MOB_ID = 'minecraft:npc';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
