import Stone, { StoneType } from './Stone.js';

import Item from '../../item/Item.js';
import Server from '../../Server.js';

export default class Andesite extends Stone {
    public constructor() {
        super('minecraft:andesite', StoneType.Andesite);
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getBlockManager().getBlock('minecraft:andesite')];
    }
}
