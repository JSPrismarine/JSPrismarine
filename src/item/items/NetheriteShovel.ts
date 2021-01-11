import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

export default class NetheriteShovel extends TieredTool {
    constructor() {
        super(
            {
                name: 'minecraft:netherite_shovel',
                id: ItemIdsType.NetheriteShovel
            },
            ItemTieredToolType.Netherite
        );
    }

    getMaxDurability() {
        return 2032;
    }

    getToolType() {
        return BlockToolType.Shovel;
    }
}
