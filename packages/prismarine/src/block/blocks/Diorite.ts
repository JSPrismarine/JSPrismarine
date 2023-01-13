import Stone, { StoneType } from './Stone.js';

import Item from '../../item/Item.js';
import Server from '../../Server.js';

export default class Diorite extends Stone {
    public constructor() {
        super('minecraft:diorite', StoneType.Diorite);
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getBlockManager().getBlock('minecraft:diorite')];
    }
}
