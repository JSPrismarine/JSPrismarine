import TieredTool from '../TieredTool';
import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';

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
