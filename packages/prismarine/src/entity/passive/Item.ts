import Block from '../../block/Block';
import Entity from '../Entity';
import type Server from '../../Server';
import type World from '../../world/World';

export default class Item extends Entity {
    public static MOB_ID = 'minecraft:item';

    public constructor(world: World, server: Server, block: Block) {
        super(world, server);
    }
}
