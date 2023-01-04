import Entity from '../Entity.js';
import Server from '../../Server.js';
import World from '../../world/World.js';

export default class LlamaSpit extends Entity {
    public static MOB_ID = 'minecraft:llama_spit.js';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
