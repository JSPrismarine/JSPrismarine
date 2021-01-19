import Stone, { StoneType } from './Stone';

import Item from '../../item/Item';
import Server from '../../Server';

export default class PolishedDiorite extends Stone {
    public constructor() {
        super('minecraft:polished_diorite', StoneType.PolishedDiorite);
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [
            server.getBlockManager().getBlock('minecraft:polished_diorite')
        ];
    }
}
