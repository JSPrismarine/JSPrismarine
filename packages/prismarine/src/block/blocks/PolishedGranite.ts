import Stone, { StoneType } from './Stone';

import type { Item } from '../../item/Item';
import type Server from '../../Server';

export default class Granite extends Stone {
    public constructor() {
        super('minecraft:polished_granite', StoneType.PolishedGranite);
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getBlockManager().getBlock('minecraft:polished_granite')];
    }
}
