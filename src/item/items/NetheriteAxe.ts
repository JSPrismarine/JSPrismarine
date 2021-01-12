import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

export default class NetheriteAxe extends TieredTool {
    constructor() {
        super(
            {
                name: 'minecraft:netherite_axe',
                id: ItemIdsType.NetheriteAxe
            },
            ItemTieredToolType.Netherite
        );
    }

    getMaxDurability() {
        return 2032;
    }

    getToolType() {
        return BlockToolType.Axe;
    }
}
