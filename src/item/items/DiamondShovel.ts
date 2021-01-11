import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

export default class DiamondShovel extends TieredTool {
    constructor() {
        super(
            {
                name: 'minecraft:diamond_shovel',
                id: ItemIdsType.DiamondShovel
            },
            ItemTieredToolType.Diamond
        );
    }

    getMaxDurability() {
        return 1562;
    }

    getToolType() {
        return BlockToolType.Shovel;
    }
}
