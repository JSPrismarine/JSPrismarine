import Stone, { StoneType } from './Stone';

import type { Item } from '../../item/Item';
import type Server from '../../Server';

export default class Andesite extends Stone {
    public constructor() {
        super('minecraft:andesite', StoneType.Andesite);
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getBlockManager().getBlock('minecraft:andesite')];
    }
}
