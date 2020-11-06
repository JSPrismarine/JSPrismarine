import Stone, { StoneType } from './Stone';
import Item from '../../item/Item';
import Prismarine from '../../Prismarine';

export default class Granite extends Stone {
    constructor() {
        super('minecraft:polished_granite', StoneType.PolishedGranite);
    }

    getDropsForCompatibleTool(item: Item, server: Prismarine) {
        return [
            server.getBlockManager().getBlock('minecraft:polished_granite')
        ];
    }
}
