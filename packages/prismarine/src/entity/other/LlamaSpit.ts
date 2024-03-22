import Entity from '../Entity';
import Server from '../../Server';
import World from '../../world/World';

export default class LlamaSpit extends Entity {
    public static MOB_ID = 'minecraft:llama_spit';

    public constructor(world: World, server: Server) {
        super(world, server);
    }
}
