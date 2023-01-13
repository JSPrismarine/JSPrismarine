import Stone, { StoneType } from './Stone.js';

import Item from '../../item/Item.js';
import Server from '../../Server.js';

export default class Granite extends Stone {
    public constructor() {
        super('minecraft:polished_granite', StoneType.PolishedGranite);
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getBlockManager().getBlock('minecraft:polished_granite')];
    }
}
