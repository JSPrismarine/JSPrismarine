import Stone, { StoneType } from './Stone';

import Item from '../../item/Item';
import Server from '../../Server';

export default class PolishedAndesite extends Stone {
    public constructor() {
        super('minecraft:polished_andesite', StoneType.PolishedAndesite);
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getBlockManager().getBlock('minecraft:polished_andesite')];
    }
}
