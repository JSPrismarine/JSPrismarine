import Stone, { StoneType } from './Stone';

import Item from '../../item/Item';
import Server from '../../Server';

export default class Granite extends Stone {
    public constructor() {
        super('minecraft:granite', StoneType.Granite);
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getBlockManager().getBlock('minecraft:granite')];
    }
}
