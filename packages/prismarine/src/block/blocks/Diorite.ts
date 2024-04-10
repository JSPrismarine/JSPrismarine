import Stone, { StoneType } from './Stone';

import type Item from '../../item/Item';
import type Server from '../../Server';

export default class Diorite extends Stone {
    public constructor() {
        super('minecraft:diorite', StoneType.Diorite);
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getBlockManager().getBlock('minecraft:diorite')];
    }
}
