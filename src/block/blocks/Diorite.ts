import Stone, { StoneType } from './Stone';

import Item from '../../item/Item';
import Server from '../../Server';

export default class Diorite extends Stone {
    public constructor() {
        super('minecraft:diorite', StoneType.Diorite);
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getBlockManager().getBlock('minecraft:diorite')];
    }
}
