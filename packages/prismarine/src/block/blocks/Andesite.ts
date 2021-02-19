import Stone, { StoneType } from './Stone';

import Item from '../../item/Item';
import Server from '../../Server';

export default class Andesite extends Stone {
    public constructor() {
        super('minecraft:andesite', StoneType.Andesite);
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getBlockManager().getBlock('minecraft:andesite')];
    }
}
