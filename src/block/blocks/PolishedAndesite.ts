import Stone, {StoneType} from './Stone';
import Item from '../../item/Item';
import Prismarine from '../../Prismarine';

export default class PolishedAndesite extends Stone {
    constructor() {
        super('minecraft:polished_andesite', StoneType.PolishedAndesite);
    }

    getDropsForCompatibleTool(item: Item, server: Prismarine) {
        return [
            server.getBlockManager().getBlock('minecraft:polished_andesite')
        ];
    }
}
