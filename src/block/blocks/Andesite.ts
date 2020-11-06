import Stone, { StoneType } from './Stone';
import Item from '../../item/Item';
import Prismarine from '../../Prismarine';

export default class Andesite extends Stone {
    constructor() {
        super('minecraft:andesite', StoneType.Andesite);
    }

    getDropsForCompatibleTool(item: Item, server: Prismarine) {
        return [server.getBlockManager().getBlock('minecraft:andesite')];
    }
}
